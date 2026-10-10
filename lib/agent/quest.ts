import type { LatLon, Place, Quest, QuestContext, QuestDraft } from "../types";
import { QuestDraftSchema } from "../types";
import type { LLMProvider } from "../llm/types";
import { generateStructured } from "../llm/json";
import { homePlace, pickCandidates } from "../context/places";
import { weatherSummary } from "../context/weather";
import { buildQuestPrompt, QUEST_SYSTEM } from "./prompts";
import { hashSeed, pickFromBank } from "./bank";

/**
 * Candidates are built on the device. Outdoors: up to three green/blue spaces
 * that fit the quest length, or a loop around the block when the map is empty.
 * Bad conditions: only "home" (balcony, terrace, window).
 * The home/block candidates carry coarsened coordinates; the app swaps in the
 * precise ones locally after the quest comes back.
 */
export function buildCandidates(ctx: Pick<QuestContext, "places" | "conditions" | "questMinutes">, origin: LatLon): Place[] {
  if (ctx.conditions !== "good") return [homePlace(origin)];
  const picked = pickCandidates(ctx.places, ctx.questMinutes);
  if (picked.length) return picked;
  return [{ ...homePlace(origin, "A slow loop around your block"), id: "block", kind: "trail" }];
}

export function questSchemaFor(ctx: QuestContext) {
  const ids = ctx.places.map((p) => p.id);
  return QuestDraftSchema.superRefine((q, issue) => {
    if (!ids.includes(q.placeId)) {
      issue.addIssue({ code: "custom", path: ["placeId"], message: `must be one of: ${ids.join(", ")}` });
    }
    if (ctx.conditions !== "good" && !q.indoorAdjacent) {
      issue.addIssue({ code: "custom", path: ["indoorAdjacent"], message: "must be true when conditions are not good" });
    }
  });
}

export function fallbackDraft(ctx: QuestContext): QuestDraft {
  const place = ctx.places[0];
  const t = pickFromBank(place.kind, ctx.conditions, hashSeed(`${place.id}|${ctx.localTime}`));
  return {
    ...t,
    placeId: place.id,
    durationMinutes: ctx.questMinutes,
    indoorAdjacent: ctx.conditions !== "good" || place.kind === "home"
  };
}

export interface RunQuestOptions {
  /** ctx.places must already be the candidate list (see buildCandidates). */
  ctx: QuestContext;
  provider: LLMProvider;
  now?: Date;
  id?: string;
}

/**
 * The agent loop's model step: context in, one validated quest out.
 * The rules (weather, daylight, distance) are decided in code before Gemma
 * is asked; Gemma chooses the place and writes the quest; zod checks it and
 * feeds errors back for a retry; a hand-written quest is the last resort.
 */
export async function runQuestAgent({ ctx, provider, now = new Date(), id }: RunQuestOptions): Promise<Quest> {
  if (!ctx.places.length) throw new Error("runQuestAgent needs at least one candidate place");
  let draft: QuestDraft;
  let source: Quest["source"] = "model";
  let note: string | undefined;
  try {
    const res = await generateStructured(provider, questSchemaFor(ctx), {
      system: QUEST_SYSTEM,
      prompt: buildQuestPrompt(ctx, ctx.places)
    });
    draft = res.data;
    if (res.attempts > 1) note = `Model needed ${res.attempts} tries to produce valid JSON.`;
  } catch (e) {
    draft = fallbackDraft(ctx);
    source = "fallback";
    note = e instanceof Error ? e.message : String(e);
  }
  const place = ctx.places.find((p) => p.id === draft.placeId) ?? ctx.places[0];
  return {
    ...draft,
    // Code, not the model, is the authority on time and safety mode.
    durationMinutes: ctx.questMinutes,
    indoorAdjacent: draft.indoorAdjacent || ctx.conditions !== "good",
    placeId: place.id,
    place,
    id: id ?? `q_${now.getTime().toString(36)}_${hashSeed(draft.title).toString(36).slice(0, 4)}`,
    createdAt: now.toISOString(),
    conditions: ctx.conditions,
    weatherSummary: weatherSummary(ctx.weather),
    model: source === "model" ? provider.model : "built-in quest",
    source,
    ...(note ? { note } : {})
  };
}
