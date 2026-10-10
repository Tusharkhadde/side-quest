import { z } from "zod";
import type { JournalEntry } from "./types";

/**
 * When is a nudge most likely to be accepted?
 *
 * ml/nudge_time.py trains TabPFN on the exported journal and writes
 * public/best_hours.json. When that file is absent, this heuristic stands in:
 * a daylight-shaped prior blended with your own accept rate per hour.
 */

export const BestHoursSchema = z.object({
  generatedAt: z.string(),
  model: z.string(),
  rows: z.number().int().nonnegative().optional(),
  hours: z
    .array(z.object({ hour: z.number().int().min(0).max(23), pAccept: z.number().min(0).max(1) }))
    .min(1)
});
export type BestHours = z.infer<typeof BestHoursSchema>;

/** Prior acceptance by hour: late afternoon is the sweet spot, nights are off. */
export const HOUR_PRIOR: readonly number[] = [
  0.02, 0.02, 0.02, 0.02, 0.02, 0.05, // 00-05
  0.3, 0.5, 0.5, 0.35, 0.35, 0.3, //     06-11
  0.25, 0.25, 0.3, 0.4, 0.65, 0.65, //   12-17
  0.6, 0.45, 0.2, 0.15, 0.05, 0.02 //    18-23
];

const PRIOR_WEIGHT = 4;

export function isAccepted(status: JournalEntry["status"]): boolean {
  return status === "accepted" || status === "completed" || status === "abandoned";
}

/** Laplace-style smoothing: (accepted + prior*k) / (offered + k). */
export function heuristicHourScores(entries: Pick<JournalEntry, "hour" | "status">[]): number[] {
  const offered = new Array<number>(24).fill(0);
  const accepted = new Array<number>(24).fill(0);
  for (const e of entries) {
    if (e.hour < 0 || e.hour > 23) continue;
    offered[e.hour] += 1;
    if (isAccepted(e.status)) accepted[e.hour] += 1;
  }
  return HOUR_PRIOR.map((p, h) => (accepted[h] + p * PRIOR_WEIGHT) / (offered[h] + PRIOR_WEIGHT));
}

export function scoresFromBestHours(b: BestHours): number[] {
  const scores = new Array<number>(24).fill(0);
  for (const { hour, pAccept } of b.hours) scores[hour] = pAccept;
  return scores;
}

export function topHours(scores: number[], n = 3): number[] {
  return scores
    .map((s, h) => ({ s, h }))
    .sort((a, b) => b.s - a.s || a.h - b.h)
    .slice(0, n)
    .map((x) => x.h)
    .sort((a, b) => a - b);
}

/** Nudge if this hour is good in absolute terms or among your best three. */
export function shouldNudge(hour: number, scores: number[], threshold = 0.4): boolean {
  return scores[hour] >= threshold || topHours(scores).includes(hour);
}

export function formatHour(h: number): string {
  const suffix = h < 12 ? "am" : "pm";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${suffix}`;
}
