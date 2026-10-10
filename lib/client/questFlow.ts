"use client";

import { coarsen } from "../geo";
import { fetchWeather, classifyConditions } from "../context/weather";
import { fetchPlaces } from "../context/places";
import { buildCandidates } from "../agent/quest";
import type { JournalEntry, LatLon, Quest } from "../types";
import { lastLocation, rememberLocation, type Settings } from "./settings";
import { saveEntry } from "./db";

export class LocationError extends Error {}

/** Precise location stays in this tab. Falls back to the saved home area. */
export function getLocation(settings: Settings, timeoutMs = 8000): Promise<LatLon> {
  return new Promise((resolve, reject) => {
    const fallback = () => {
      if (settings.homeArea) return resolve({ lat: settings.homeArea.lat, lon: settings.homeArea.lon });
      const last = lastLocation();
      if (last) return resolve(last);
      reject(new LocationError("Location is off. Set a home area in Settings to get quests without GPS."));
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

export interface QuestResult {
  quest: Quest;
  entry: JournalEntry;
  origin: LatLon;
}

/**
 * The full agent loop as the device runs it:
 * 1. location (on device) 2. weather + green space (coarse point only)
 * 3. rules pick the safe mode and candidates 4. Gemma writes the quest
 * 5. journal it locally.
 */
export async function requestQuest(settings: Settings, screenMinutes: number, onStage?: (s: string) => void): Promise<QuestResult> {
  onStage?.("Finding where you are");
  const origin = await getLocation(settings);
  onStage?.("Checking the sky and the sunset");
  const [weather, places] = await Promise.all([fetchWeather(origin), fetchPlaces(origin, settings.searchRadiusM)]);
  const conditions = classifyConditions(weather, settings.questMinutes);
  onStage?.(conditions === "good" ? "Looking for green space nearby" : "Planning something close to home");
  const candidates = buildCandidates({ places, conditions, questMinutes: settings.questMinutes }, coarsen(origin));

  const now = new Date();
  const localTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  onStage?.("Gemma is writing your quest");
  const res = await fetch("/api/quest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      weather,
      candidates,
      questMinutes: settings.questMinutes,
      localTime,
      screenMinutes: Math.min(screenMinutes, 24 * 60),
      override: settings.model
    })
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Quest request failed (${res.status})`);
  }
  const { quest } = (await res.json()) as { quest: Quest };
  // Swap the coarse home point back to the precise one, locally.
  if (quest.place.kind === "home" || quest.place.id === "block") {
    quest.place = { ...quest.place, lat: origin.lat, lon: origin.lon };
  }
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
