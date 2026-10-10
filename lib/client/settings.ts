"use client";

import type { ProviderId } from "../llm/types";
import type { Quest } from "../types";

export interface HomeArea {
  label: string;
  lat: number;
  lon: number;
}

export interface Settings {
  questMinutes: number;
  screenThresholdMin: number;
  searchRadiusM: number;
  voice: "device" | "elevenlabs";
  homeArea: HomeArea | null;
  /** Which of the server's configured open models to try first. null = server order. */
  prefer: ProviderId | null;
}

export const DEFAULT_SETTINGS: Settings = {
  questMinutes: 20,
  screenThresholdMin: 90,
  searchRadiusM: 1500,
  voice: "device",
  homeArea: null,
  prefer: null
};

const KEY = "sq.settings";

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

/** The quest in progress. Kept in localStorage so it survives going offline. */
export interface ActiveQuest {
  quest: Quest;
  entryId: string;
  startedAt?: string;
  stepIndex: number;
}

const ACTIVE = "sq.active";

export function loadActive(): ActiveQuest | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE);
    return raw ? (JSON.parse(raw) as ActiveQuest) : null;
  } catch {
    return null;
  }
}

export function saveActive(a: ActiveQuest | null): void {
  if (a) window.localStorage.setItem(ACTIVE, JSON.stringify(a));
  else window.localStorage.removeItem(ACTIVE);
  // Let the service worker know there is a quest worth keeping offline.
  navigator.serviceWorker?.controller?.postMessage({ type: a ? "quest-active" : "quest-cleared" });
}

const LAST_LOC = "sq.lastLocation";

export function rememberLocation(p: { lat: number; lon: number }) {
  window.localStorage.setItem(LAST_LOC, JSON.stringify({ ...p, at: Date.now() }));
}

export function lastLocation(): { lat: number; lon: number } | null {
  try {
    const raw = window.localStorage.getItem(LAST_LOC);
    return raw ? (JSON.parse(raw) as { lat: number; lon: number }) : null;
  } catch {
    return null;
  }
}
