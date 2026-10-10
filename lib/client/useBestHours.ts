"use client";

import { useEffect, useState } from "react";
import { BestHoursSchema, heuristicHourScores, scoresFromBestHours } from "../nudge";
import { listEntries } from "./db";

export interface HourScores {
  scores: number[];
  source: "tabpfn" | "heuristic";
  model?: string;
}

/** TabPFN output from public/best_hours.json if present, else the heuristic. */
export function useBestHours(): HourScores | null {
  const [state, setState] = useState<HourScores | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/best_hours.json", { cache: "no-store" });
        if (res.ok) {
          const parsed = BestHoursSchema.safeParse(await res.json());
          if (parsed.success) {
            if (alive) setState({ scores: scoresFromBestHours(parsed.data), source: "tabpfn", model: parsed.data.model });
            return;
          }
        }
      } catch {
        // offline or absent: use the heuristic
      }
      const entries = await listEntries().catch(() => []);
      if (alive) setState({ scores: heuristicHourScores(entries), source: "heuristic" });
    })();
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
