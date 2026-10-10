"use client";

import { useEffect } from "react";
import { useStreakTracker } from "@/lib/client/useStreak";

/** Registers the service worker and starts the on-device screen-streak tracker. */
export function ClientBoot() {
  useStreakTracker();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // offline support is a bonus; the app works without it
    });
  }, []);
  return null;
}
