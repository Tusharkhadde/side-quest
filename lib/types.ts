import { z } from "zod";

/** A single step of a quest. Short enough to be spoken aloud. */
export const QuestStepSchema = z.object({
  kind: z.enum(["observe", "collect", "notice", "move", "listen"]),
  text: z.string().min(4).max(180)
});
export type QuestStep = z.infer<typeof QuestStepSchema>;

/** What Gemma must return when it writes a quest. */
export const QuestDraftSchema = z.object({
  title: z.string().min(3).max(60),
  placeId: z.string().min(1),
  intro: z.string().min(8).max(280),
  steps: z.array(QuestStepSchema).length(3),
  safety: z.string().min(6).max(180),
  proof: z.string().min(6).max(180),
  durationMinutes: z.number().int().min(5).max(60),
  indoorAdjacent: z.boolean().default(false)
});
export type QuestDraft = z.infer<typeof QuestDraftSchema>;

/** What Gemma must return when it checks a proof photo. */
export const VerdictSchema = z.object({
  pass: z.boolean(),
  comment: z.string().min(2).max(220),
  confidence: z.number().min(0).max(1).optional()
});
export type Verdict = z.infer<typeof VerdictSchema>;

export interface LatLon {
  lat: number;
  lon: number;
}

export type PlaceKind = "park" | "garden" | "trail" | "water" | "nature" | "viewpoint" | "home";

export interface Place {
  id: string;
  name: string;
  kind: PlaceKind;
  lat: number;
  lon: number;
  distanceMeters: number;
  walkMinutes: number;
}

export interface WeatherNow {
  temperatureC: number;
  apparentC: number;
  weatherCode: number;
  description: string;
  /** Highest rain probability over this hour and the next, 0-100. */
  precipitationProbability: number;
  windKph: number;
  isDay: boolean;
  /** Local wall-clock ISO strings, as Open-Meteo returns them. */
  sunrise: string;
  sunset: string;
  /** Negative once the sun has set. */
  minutesToSunset: number;
  fetchedAt: string;
}

export type Conditions = "good" | "rain" | "dark" | "too-hot" | "too-cold" | "storm";

export interface QuestContext {
  weather: WeatherNow | null;
  places: Place[];
  conditions: Conditions;
  questMinutes: number;
  /** HH:MM local */
  localTime: string;
  screenMinutes: number;
}

export interface Quest extends QuestDraft {
  id: string;
  createdAt: string;
  place: Place;
  conditions: Conditions;
  weatherSummary: string;
  model: string;
  source: "model" | "fallback";
  note?: string;
}

export type QuestStatus = "offered" | "accepted" | "declined" | "completed" | "abandoned";

export interface JournalEntry {
  id: string;
  quest: Quest;
  status: QuestStatus;
  offeredAt: string;
  startedAt?: string;
  finishedAt?: string;
  minutesOutside?: number;
  verdict?: Verdict & { checkedBy: "model" | "self" };
  photoId?: string;
  hour: number;
  weekday: number;
  weatherCode?: number;
  temperatureC?: number;
  minutesToSunset?: number;
}
