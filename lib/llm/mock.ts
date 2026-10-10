import type { Conditions, PlaceKind } from "../types";
import { hashSeed, pickFromBank } from "../agent/bank";
import { readContextBlock } from "../agent/prompts";
import type { CompletionRequest, LLMProvider } from "./types";

interface QuestPromptContext {
  conditions: Conditions;
  questMinutes: number;
  localTime: string;
  candidates: { id: string; type: PlaceKind; name: string }[];
}

/**
 * A deterministic stand-in for Gemma. It reads the same prompt the real model
 * gets and answers with a hand-written quest, so the full agent loop, schema
 * validation and UI can run in tests and demos without a GPU.
 */
export class MockProvider implements LLMProvider {
  readonly name = "mock" as const;
  readonly model = "mock-gemma";
  readonly visionModel = "mock-gemma-vision";

  async complete(req: CompletionRequest): Promise<string> {
    if (req.system.includes("TASK=verify")) return this.verify(req);
    return this.quest(req);
  }

  private quest(req: CompletionRequest): string {
    const ctx = readContextBlock<QuestPromptContext>(req.prompt);
    if (!ctx || !ctx.candidates?.length) return "{}";
    const outdoor = ctx.conditions === "good";
    const place = outdoor
      ? (ctx.candidates.find((c) => c.id !== "home") ?? ctx.candidates[0])
      : (ctx.candidates.find((c) => c.id === "home") ?? ctx.candidates[0]);
    const seed = hashSeed(`${place.id}|${ctx.conditions}|${ctx.localTime.slice(0, 2)}`);
    const t = pickFromBank(place.type, ctx.conditions, seed);
    return JSON.stringify({
      ...t,
      placeId: place.id,
      durationMinutes: ctx.questMinutes,
      indoorAdjacent: !outdoor || place.type === "home"
    });
  }

  private verify(req: CompletionRequest): string {
    const img = req.images?.[0] ?? "";
    // "Pass" anything that looks like a real photo; tiny payloads fail.
    const pass = img.length >= 1000;
    return JSON.stringify({
      pass,
      comment: pass
        ? "Demo mode: that looks like a real moment outside. Stamp earned."
        : "Demo mode: I could not make out a photo there. Try one more shot?",
      confidence: pass ? 0.7 : 0.2
    });
  }
}
