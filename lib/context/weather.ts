import type { Conditions, LatLon, WeatherNow } from "../types";
import { coarsen } from "../geo";
import { TTLCache, readLocal, writeLocal } from "./cache";

/** WMO weather interpretation codes, as used by Open-Meteo. */
export function describeWeatherCode(code: number): string {
  if (code === 0) return "clear sky";
  if (code <= 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code >= 61 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain showers";
  if (code === 85 || code === 86) return "snow showers";
  if (code >= 95) return "thunderstorm";
  return "unsettled";
}

export function isWetCode(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
}

export function isStormCode(code: number): boolean {
  return code >= 95;
}

/** Minutes between two Open-Meteo local timestamps ("2026-10-10T18:15"). */
export function minutesBetween(fromLocal: string, toLocal: string): number {
  const a = Date.parse(`${fromLocal.slice(0, 16)}:00Z`);
  const b = Date.parse(`${toLocal.slice(0, 16)}:00Z`);
  return Math.round((b - a) / 60000);
}

export interface OpenMeteoResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    is_day: number;
  };
  hourly?: { time: string[]; precipitation_probability: (number | null)[] };
  daily: { time: string[]; sunrise: string[]; sunset: string[] };
}

export function buildOpenMeteoUrl(p: LatLon): string {
  const c = coarsen(p);
  const params = new URLSearchParams({
    latitude: String(c.lat),
    longitude: String(c.lon),
    current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day",
    hourly: "precipitation_probability",
    daily: "sunrise,sunset",
    timezone: "auto",
    forecast_days: "1"
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

/** Turn the raw Open-Meteo payload into the few numbers the agent needs. */
export function parseOpenMeteo(json: OpenMeteoResponse, fetchedAt = new Date().toISOString()): WeatherNow {
  const cur = json.current;
  const sunrise = json.daily.sunrise[0];
  const sunset = json.daily.sunset[0];
  let precip = 0;
  if (json.hourly) {
    const hourKey = cur.time.slice(0, 13);
    const idx = json.hourly.time.findIndex((t) => t.slice(0, 13) === hourKey);
    const next = idx >= 0 ? json.hourly.precipitation_probability.slice(idx, idx + 2) : [];
    precip = Math.max(0, ...next.map((v) => v ?? 0));
  }
  return {
    temperatureC: cur.temperature_2m,
    apparentC: cur.apparent_temperature,
    weatherCode: cur.weather_code,
    description: describeWeatherCode(cur.weather_code),
    precipitationProbability: precip,
    windKph: cur.wind_speed_10m,
    isDay: cur.is_day === 1,
    sunrise,
    sunset,
    minutesToSunset: minutesBetween(cur.time, sunset),
    fetchedAt
  };
}

/**
 * The rules that decide what kind of quest is safe right now.
 * Gemma is told the verdict; it does not get to overrule it.
 */
export function classifyConditions(w: WeatherNow | null, questMinutes: number): Conditions {
  if (!w) return "good";
  if (isStormCode(w.weatherCode) || w.windKph >= 50) return "storm";
  if (isWetCode(w.weatherCode) || w.precipitationProbability >= 60) return "rain";
  // The whole quest plus a 10 minute buffer has to fit before sunset.
  if (!w.isDay || w.minutesToSunset < questMinutes + 10) return "dark";
  if (w.apparentC >= 40) return "too-hot";
  if (w.apparentC <= -5) return "too-cold";
  return "good";
}

export function conditionsLabel(c: Conditions): string {
  switch (c) {
    case "good":
      return "Good to go outside";
    case "rain":
      return "Rain likely: staying close";
    case "dark":
      return "Too little daylight left";
    case "too-hot":
      return "Too hot right now";
    case "too-cold":
      return "Too cold right now";
    case "storm":
      return "Storm: staying in";
  }
}

export function formatSunset(minutes: number): string {
  if (minutes <= 0) return "after sunset";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m to sunset` : `${m}m to sunset`;
}

export function weatherSummary(w: WeatherNow | null): string {
  if (!w) return "weather unknown";
  return `${Math.round(w.temperatureC)}°C, ${w.description}, ${w.precipitationProbability}% rain, ${formatSunset(w.minutesToSunset)}`;
}

const memory = new TTLCache<WeatherNow>(15 * 60 * 1000);

export async function fetchWeather(p: LatLon, fetchImpl: typeof fetch = fetch): Promise<WeatherNow | null> {
  const url = buildOpenMeteoUrl(p);
  const hit = memory.get(url) ?? readLocal<WeatherNow>(`sq.weather.${url}`, 15 * 60 * 1000);
  if (hit) return hit;
  try {
    const res = await fetchImpl(url, { cache: "no-store" });
    if (!res.ok) return null;
    const parsed = parseOpenMeteo((await res.json()) as OpenMeteoResponse);
    memory.set(url, parsed);
    writeLocal(`sq.weather.${url}`, parsed);
    return parsed;
  } catch {
    return null;
  }
}
