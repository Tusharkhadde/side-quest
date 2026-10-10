import { describe, expect, it } from "vitest";
import { BestHoursSchema, HOUR_PRIOR, heuristicHourScores, scoresFromBestHours, shouldNudge, topHours, formatHour } from "@/lib/nudge";
import { journalToCsv, CSV_HEADER } from "@/lib/csv";
import { computeStats, dayStreak } from "@/lib/stats";
import { continuousMinutes, EMPTY_STREAK, IDLE_RESET_MS, recordActivity } from "@/lib/streak";
import type { JournalEntry, Quest } from "@/lib/types";

describe("nudge heuristic", () => {
  it("falls back to the daylight prior with no history", () => {
    const s = heuristicHourScores([]);
    expect(s).toHaveLength(24);
    expect(s[3]).toBeCloseTo(HOUR_PRIOR[3]);
    expect(topHours(s)).toEqual([16, 17, 18]);
  });

  it("learns from your own accept/decline history", () => {
    const history = [
      ...Array.from({ length: 6 }, () => ({ hour: 7, status: "completed" as const })),
      ...Array.from({ length: 6 }, () => ({ hour: 17, status: "declined" as const }))
    ];
    const s = heuristicHourScores(history);
    expect(s[7]).toBeGreaterThan(HOUR_PRIOR[7]);
    expect(s[17]).toBeLessThan(HOUR_PRIOR[17]);
    expect(topHours(s)).toContain(7);
  });

  it("decides when to nudge", () => {
    const s = heuristicHourScores([]);
    expect(shouldNudge(17, s)).toBe(true);
    expect(shouldNudge(2, s)).toBe(false);
  });

  it("reads TabPFN output", () => {
    const parsed = BestHoursSchema.parse({ generatedAt: "x", model: "TabPFNClassifier", hours: [{ hour: 6, pAccept: 0.8 }] });
    const s = scoresFromBestHours(parsed);
    expect(s[6]).toBe(0.8);
    expect(s[7]).toBe(0);
    expect(BestHoursSchema.safeParse({ generatedAt: "x", model: "m", hours: [{ hour: 25, pAccept: 0.1 }] }).success).toBe(false);
  });

  it("formats hours", () => {
    expect(formatHour(0)).toBe("12am");
    expect(formatHour(17)).toBe("5pm");
  });
});

function entry(status: JournalEntry["status"], day: string, extra: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: `${status}-${day}`,
    quest: { conditions: "good", weatherSummary: "" } as Quest,
    status,
    offeredAt: `${day}T17:00:00`,
    finishedAt: status === "completed" ? `${day}T17:25:00` : undefined,
    minutesOutside: status === "completed" ? 25 : undefined,
    hour: 17,
    weekday: 6,
    weatherCode: 2,
    temperatureC: 28.25,
    minutesToSunset: 80,
    ...extra
  };
}

describe("journal export and stats", () => {
  it("exports a CSV with no location data", () => {
    const csv = journalToCsv([entry("completed", "2026-10-10"), entry("declined", "2026-10-09")]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(CSV_HEADER.join(","));
    expect(lines[1]).toBe("17,6,2,28.3,80,good,1,1");
    expect(lines[2]).toBe("17,6,2,28.3,80,good,0,0");
    expect(csv).not.toMatch(/lat|lon/);
  });

  it("computes streaks and totals", () => {
    const now = new Date("2026-10-10T20:00:00");
    const es = [entry("completed", "2026-10-10"), entry("completed", "2026-10-09"), entry("completed", "2026-10-07"), entry("declined", "2026-10-08")];
    expect(dayStreak(es, now)).toBe(2);
    const stats = computeStats(es, now);
    expect(stats.completed).toBe(3);
    expect(stats.minutesOutside).toBe(75);
    expect(stats.acceptRate).toBeCloseTo(0.75);
  });
});

describe("screen streak", () => {
  it("accumulates continuous activity and resets after an idle gap", () => {
    const t0 = 1_000_000;
    let s = recordActivity(EMPTY_STREAK, t0);
    s = recordActivity(s, t0 + 4 * 60_000);
    s = recordActivity(s, t0 + 8 * 60_000);
    expect(continuousMinutes(s, t0 + 9 * 60_000)).toBe(9);
    expect(continuousMinutes(s, t0 + 8 * 60_000 + IDLE_RESET_MS + 1)).toBe(0);
    s = recordActivity(s, t0 + 20 * 60_000);
    expect(continuousMinutes(s, t0 + 21 * 60_000)).toBe(1);
  });
});
