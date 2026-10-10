import type { LatLon, Place, Quest, QuestContext, QuestDraft } from "../types";
import { QuestDraftSchema } from "../types";
import type { LLMProvider } from "../llm/types";
import { ChainError, generateWithFallback } from "../llm/chain";
import { modelLabel } from "../llm/labels";
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
  /** Open models to try, in order (see resolveChain). */
  providers: LLMProvider[];
  timeoutMs?: number;
  now?: Date;
  id?: string;
}

/**
 * The agent loop's model step: context in, one validated quest out.
 * The rules (weather, daylight, distance) are decided in code before the
 * model is asked; the model chooses the place and writes the quest; zod
 * checks it and feeds errors back for a retry; if one open model fails the
 * next one in the chain is tried; a hand-written quest is the last resort.
 */
export async function runQuestAgent({ ctx, providers, timeoutMs, now = new Date(), id }: RunQuestOptions): Promise<Quest> {
  if (!ctx.places.length) throw new Error("runQuestAgent needs at least one candidate place");
  let draft: QuestDraft;
  let source: Quest["source"] = "model";
  let note: string | undefined;
  let modelUsed: Quest["modelUsed"];
  let calls: Quest["calls"] = [];
  try {
    const res = await generateWithFallback(
      providers,
      questSchemaFor(ctx),
      { system: QUEST_SYSTEM, prompt: buildQuestPrompt(ctx, ctx.places) },
      { timeoutMs }
    );
    draft = res.data;
    calls = res.calls;
    modelUsed = {
      provider: res.provider.id,
      service: res.provider.service,
      host: res.provider.host,
      model: res.model,
      label: modelLabel(res.model)
    };
    if (res.attempts > 1) note = `The model needed ${res.attempts} tries to produce valid JSON.`;
  } catch (e) {
    draft = fallbackDraft(ctx);
    source = "fallback";
    calls = e instanceof ChainError ? e.calls : [];
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
    model: modelUsed ? modelUsed.label : "built-in quest",
    ...(modelUsed ? { modelUsed } : {}),
    calls,
    source,
    ...(note ? { note } : {})
  };
}
