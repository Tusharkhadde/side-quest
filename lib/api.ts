import { z } from "zod";
import { PROVIDER_IDS } from "./llm/types";

/** A preference among the open models the server has configured. Never a URL or a key. */
export const ModelPreferenceSchema = z.enum(PROVIDER_IDS);

/** Request bodies for the app's own API routes, shared by client and server. */

export const PlaceSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  kind: z.enum(["park", "garden", "trail", "water", "nature", "viewpoint", "home"]),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  distanceMeters: z.number().nonnegative(),
  walkMinutes: z.number().nonnegative()
});

export const WeatherSchema = z.object({
  temperatureC: z.number(),
  apparentC: z.number(),
  weatherCode: z.number().int(),
  description: z.string().max(60),
  precipitationProbability: z.number().min(0).max(100),
  windKph: z.number(),
  isDay: z.boolean(),
  sunrise: z.string().max(40),
  sunset: z.string().max(40),
  minutesToSunset: z.number(),
  fetchedAt: z.string().max(40)
});

export const QuestRequestSchema = z.object({
  weather: WeatherSchema.nullable(),
  candidates: z.array(PlaceSchema).min(1).max(5),
  questMinutes: z.number().int().min(5).max(60),
  localTime: z.string().regex(/^\d{2}:\d{2}$/),
  screenMinutes: z.number().int().min(0).max(24 * 60),
  prefer: ModelPreferenceSchema.nullish(),
  demo: z.boolean().optional()
});
export type QuestRequest = z.infer<typeof QuestRequestSchema>;

export const VerifyRequestSchema = z.object({
  imageBase64: z.string().min(16).max(6_000_000),
  proof: z.string().min(3).max(200),
  questTitle: z.string().min(1).max(80),
  prefer: ModelPreferenceSchema.nullish()
});
export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;

export const TtsRequestSchema = z.object({ text: z.string().min(1).max(600) });
