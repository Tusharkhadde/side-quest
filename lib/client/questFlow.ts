"use client";

import { coarsen } from "../geo";
import { fetchWeather, classifyConditions } from "../context/weather";
import { fetchPlaces } from "../context/places";
import { buildCandidates } from "../agent/quest";
import { DEMO_CITY, DEMO_LOCAL_TIME, DEMO_ORIGIN, DEMO_SCREEN_MINUTES, demoPlaces, demoWeather } from "../demo/sample";
import { modelLabel } from "../llm/labels";
import type { DisclosureItem, JournalEntry, LatLon, ModelCall, Place, Quest, WeatherNow } from "../types";
import { lastLocation, rememberLocation, type Settings } from "./settings";
import { saveEntry } from "./db";

export class LocationError extends Error {}

/** Precise location stays in this tab. Falls back to the saved home area. */
export function getLocation(settings: Settings, timeoutMs = 8000): Promise<LatLon> {
  return new Promise((resolve, reject) => {
    const fallback = () => {
      if (settings.homeArea && (settings.homeArea.lat || settings.homeArea.lon)) {
        return resolve({ lat: settings.homeArea.lat, lon: settings.homeArea.lon });
      }
      const last = lastLocation();
      if (last) return resolve(last);
      reject(new LocationError("Location is off, so there is nowhere to send you yet. Try the demo quest, or set a home area in Settings."));
    };
    if (typeof navigator === "undefined" || !navigator.geolocation) return fallback();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        rememberLocation(p);
        resolve(p);
      },
      fallback,
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60 * 1000 }
    );
  });
}

/**
 * What a candidate looks like when it leaves the device. Park coordinates are
 * public map data, but three exact distances from you to three known parks
 * would pin down where you are, so distances are rounded to 250 m and walking
 * times to 5 minutes. The precise numbers are put back locally afterwards.
 */
export function blurForServer(p: Place): Place {
  if (p.kind === "home" || p.id === "block") return { ...p, distanceMeters: 0, walkMinutes: 0 };
  return {
    ...p,
    distanceMeters: Math.max(250, Math.round(p.distanceMeters / 250) * 250),
    walkMinutes: Math.max(5, Math.round(p.walkMinutes / 5) * 5)
  };
}

/** Build the "what left your device" list for one quest. */
export function questDisclosure(args: {
  demo: boolean;
  coarse: LatLon | null;
  radiusM: number;
  candidates: Place[];
  screenMinutes: number;
  calls: ModelCall[];
}): DisclosureItem[] {
  const items: DisclosureItem[] = [];
  if (args.demo) {
    items.push({ to: "Nowhere", what: `Sample ${DEMO_CITY} location, OpenStreetMap snapshot and sample weather bundled with the app`, why: "Demo quest: your location was not read" });
  } else if (args.coarse) {
    const pt = `${args.coarse.lat.toFixed(2)}, ${args.coarse.lon.toFixed(2)}`;
    items.push({ to: "api.open-meteo.com", what: `A point rounded to ~1 km (${pt})`, why: "Weather and sunset (skipped if cached in the last 15 min)" });
    items.push({ to: "Overpass API (OpenStreetMap)", what: `The same rounded point and a ${(args.radiusM / 1000).toFixed(1)} km radius`, why: "Parks, gardens and water nearby (cached for a day)" });
  }
  items.push({
    to: "This app's server (/api/quest)",
    what: `${args.candidates.length} place name${args.candidates.length === 1 ? "" : "s"} with distances rounded to 250 m, a weather summary, the local time and "${args.screenMinutes} min on screen"`,
    why: "Context for the model. Not stored."
  });
  for (const c of args.calls) {
    if (c.provider === "demo") {
      items.push({ to: "Nothing further", what: "The built-in demo model answered on the server", why: "No hosted model key was set, or demo mode is on" });
      continue;
    }
    items.push({
      to: `${c.host} (${c.service})`,
      what: "The same context as above, as a prompt. No coordinates of yours.",
      why: c.ok ? `${modelLabel(c.model)} wrote the quest` : `${modelLabel(c.model)} was tried and failed, so the next open model was used`
    });
  }
  return items;
}

export interface QuestResult {
  quest: Quest;
  entry: JournalEntry;
  origin: LatLon;
}

export interface QuestOptions {
  /** Sample city and weather; no location permission needed. */
  demo?: boolean;
  onStage?: (s: string) => void;
}

/**
 * The full agent loop as the device runs it:
 * 1. location (on device) 2. weather + green space (coarse point only)
 * 3. rules pick the safe mode and candidates 4. an open model writes the quest
 * 5. journal it locally.
 */
export async function requestQuest(settings: Settings, screenMinutes: number, opts: QuestOptions = {}): Promise<QuestResult> {
  const { demo = false, onStage } = opts;
  let origin: LatLon;
  let weather: WeatherNow | null;
  let places: Place[];
  let localTime: string;
  let minutes = Math.min(screenMinutes, 24 * 60);
  const now = new Date();
  if (demo) {
    onStage?.(`Loading the sample walk in ${DEMO_CITY}`);
    origin = DEMO_ORIGIN;
    weather = demoWeather(now);
    places = demoPlaces();
    localTime = DEMO_LOCAL_TIME;
    minutes = DEMO_SCREEN_MINUTES;
  } else {
    onStage?.("Finding where you are");
    origin = await getLocation(settings);
    onStage?.("Checking the sky and the sunset");
    [weather, places] = await Promise.all([fetchWeather(origin), fetchPlaces(origin, settings.searchRadiusM)]);
    localTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }
  const conditions = classifyConditions(weather, settings.questMinutes);
  onStage?.(conditions === "good" ? "Looking for green space nearby" : "Planning something close to home");
  const precise = buildCandidates({ places, conditions, questMinutes: settings.questMinutes }, coarsen(origin));
  const candidates = precise.map(blurForServer);

  onStage?.("An open model is writing your quest");
  let res: Response;
  try {
    res = await fetch("/api/quest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weather,
        candidates,
        questMinutes: settings.questMinutes,
        localTime,
        screenMinutes: minutes,
        prefer: settings.prefer,
        demo
      })
    });
  } catch {
    throw new Error("Could not reach the Side Quest server. Check your connection and try again.");
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Quest request failed (${res.status})`);
  }
  const { quest } = (await res.json()) as { quest: Quest };
  // Put the precise numbers back, locally.
  const exact = precise.find((p) => p.id === quest.place.id);
  if (exact) quest.place = { ...quest.place, distanceMeters: exact.distanceMeters, walkMinutes: exact.walkMinutes };
  if (quest.place.kind === "home" || quest.place.id === "block") {
    quest.place = { ...quest.place, lat: origin.lat, lon: origin.lon };
  }
  quest.demo = demo;
  quest.disclosure = questDisclosure({
    demo,
    coarse: demo ? null : coarsen(origin),
    radiusM: settings.searchRadiusM,
    candidates,
    screenMinutes: minutes,
    calls: quest.calls ?? []
  });
  const entry: JournalEntry = {
    id: quest.id,
    quest,
    status: "offered",
    offeredAt: quest.createdAt,
    hour: now.getHours(),
    weekday: now.getDay(),
    weatherCode: weather?.weatherCode,
    temperatureC: weather?.temperatureC,
    minutesToSunset: weather?.minutesToSunset
  };
  await saveEntry(entry);
  return { quest, entry, origin };
}
