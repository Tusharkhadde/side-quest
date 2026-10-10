import type { JournalEntry } from "./types";
import { isAccepted } from "./nudge";

export interface JournalStats {
  completed: number;
  offered: number;
  minutesOutside: number;
  dayStreak: number;
  acceptRate: number;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Consecutive days (ending today or yesterday) with at least one finished quest. */
export function dayStreak(entries: Pick<JournalEntry, "status" | "finishedAt" | "offeredAt">[], now = new Date()): number {
  const days = new Set(
    entries
      .filter((e) => e.status === "completed")
      .map((e) => dayKey(new Date(e.finishedAt ?? e.offeredAt)))
  );
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function computeStats(entries: JournalEntry[], now = new Date()): JournalStats {
  const completed = entries.filter((e) => e.status === "completed");
  const decided = entries.filter((e) => e.status !== "offered");
  return {
    completed: completed.length,
    offered: entries.length,
    minutesOutside: completed.reduce((sum, e) => sum + (e.minutesOutside ?? 0), 0),
    dayStreak: dayStreak(entries, now),
    acceptRate: decided.length ? decided.filter((e) => isAccepted(e.status)).length / decided.length : 0
  };
}
