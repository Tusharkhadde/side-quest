"use client";

import { useEffect, useState } from "react";
import { continuousMinutes, EMPTY_STREAK, recordActivity, type StreakState } from "../streak";

const KEY = "sq.streak";
const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;

function read(): StreakState {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StreakState) : EMPTY_STREAK;
  } catch {
    return EMPTY_STREAK;
  }
}

/** Global tracker: mount once in the layout. Writes are throttled to every 15 s. */
export function useStreakTracker() {
  useEffect(() => {
    let state = read();
    let lastWrite = 0;
    const onActivity = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastWrite < 15_000 && state.lastActive !== null) return;
      state = recordActivity(read(), now);
      window.localStorage.setItem(KEY, JSON.stringify(state));
      lastWrite = now;
    };
    onActivity();
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onActivity);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", onActivity);
    };
  }, []);
}

/** Current continuous minutes, refreshed every 30 s. */
export function useScreenMinutes(): number {
  const [minutes, setMinutes] = useState(0);
  useEffect(() => {
    const tick = () => setMinutes(continuousMinutes(read(), Date.now()));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  return minutes;
}

export function resetStreak() {
  window.localStorage.setItem(KEY, JSON.stringify(EMPTY_STREAK));
}

/** Read the streak right now, outside React. */
export function currentScreenMinutes(): number {
  return continuousMinutes(read(), Date.now());
}
