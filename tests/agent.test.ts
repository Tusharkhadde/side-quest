import { describe, expect, it } from "vitest";
import { MockProvider } from "@/lib/llm/mock";
import { getProvider } from "@/lib/llm";
import type { CompletionRequest, LLMProvider } from "@/lib/llm/types";
import { buildCandidates, runQuestAgent } from "@/lib/agent/quest";
import { verifyPhoto } from "@/lib/agent/verify";
import { parseOverpass } from "@/lib/context/places";
import { buildQuestPrompt } from "@/lib/agent/prompts";
import fixture from "./fixtures/overpass.json";
import type { OverpassElement } from "@/lib/context/places";
import type { QuestContext } from "@/lib/types";

const origin = { lat: 18.6298, lon: 73.7997 };
const places = parseOverpass(fixture as unknown as { elements: OverpassElement[] }, origin);

function ctxFor(conditions: QuestContext["conditions"]): QuestContext {
  const candidates = buildCandidates({ places, conditions, questMinutes: 20 }, origin);
  return { weather: null, places: candidates, conditions, questMinutes: 20, localTime: "16:30", screenMinutes: 95 };
}

describe("mock agent loop", () => {
  it("produces a valid outdoor quest at a real candidate", async () => {
    const ctx = ctxFor("good");
    const q = await runQuestAgent({ ctx, provider: new MockProvider(), now: new Date("2026-10-10T11:00:00Z") });
    expect(q.source).toBe("model");
    expect(q.steps).toHaveLength(3);
    expect(ctx.places.map((p) => p.id)).toContain(q.placeId);
    expect(q.indoorAdjacent).toBe(false);
    expect(q.durationMinutes).toBe(20);
  });

  it("is deterministic for the same context", async () => {
    const a = await runQuestAgent({ ctx: ctxFor("good"), provider: new MockProvider(), id: "x" });
    const b = await runQuestAgent({ ctx: ctxFor("good"), provider: new MockProvider(), id: "x" });
    expect(a.title).toBe(b.title);
    expect(a.placeId).toBe(b.placeId);
  });

  it("switches to an indoor-adjacent quest in the rain", async () => {
    const ctx = ctxFor("rain");
    expect(ctx.places.map((p) => p.id)).toEqual(["home"]);
    const q = await runQuestAgent({ ctx, provider: new MockProvider() });
    expect(q.indoorAdjacent).toBe(true);
    expect(q.place.kind).toBe("home");
    expect(q.intro.toLowerCase()).toContain("indoor-adjacent");
  });

  it("offers a loop around the block when there is no green space", () => {
    const c = buildCandidates({ places: [], conditions: "good", questMinutes: 20 }, origin);
    expect(c[0].id).toBe("block");
  });

  it("retries with validation feedback, then succeeds", async () => {
    const prompts: string[] = [];
    let call = 0;
    const flaky: LLMProvider = {
      name: "mock",
      model: "flaky",
      visionModel: "flaky",
      async complete(req: CompletionRequest) {
        prompts.push(req.prompt);
        call += 1;
        if (call === 1) return "Sure, here is a quest about trees!";
        return new MockProvider().complete(req);
      }
    };
    const q = await runQuestAgent({ ctx: ctxFor("good"), provider: flaky });
    expect(q.source).toBe("model");
    expect(call).toBe(2);
    expect(prompts[1]).toContain("previous reply was invalid");
    expect(q.note).toContain("2 tries");
  });

  it("falls back to a built-in quest when the model is down", async () => {
    const down: LLMProvider = {
      name: "ollama",
      model: "gemma3n:e4b",
      visionModel: "gemma4:e4b",
      async complete() {
        throw new Error("connect ECONNREFUSED");
      }
    };
    const q = await runQuestAgent({ ctx: ctxFor("good"), provider: down });
    expect(q.source).toBe("fallback");
    expect(q.steps).toHaveLength(3);
  });

  it("never puts the user's coordinates in the prompt", () => {
    const ctx = ctxFor("good");
    const prompt = buildQuestPrompt(ctx, ctx.places);
    expect(prompt).not.toContain(String(origin.lat));
    expect(prompt).not.toContain("lat");
  });

  it("verifies photos through the same structured pipeline", async () => {
    const m = new MockProvider();
    const ok = await verifyPhoto(m, { imageBase64: "a".repeat(5000), proof: "three leaves", questTitle: "Leaves" });
    expect(ok.pass).toBe(true);
    const bad = await verifyPhoto(m, { imageBase64: "a".repeat(20), proof: "three leaves", questTitle: "Leaves" });
    expect(bad.pass).toBe(false);
  });
});

describe("provider selection", () => {
  it("defaults to Ollama with gemma3n", () => {
    const p = getProvider({});
    expect(p.name).toBe("ollama");
    expect(p.model).toBe("gemma3n:e4b");
  });

  it("uses the mock in demo mode", () => {
    expect(getProvider({ DEMO_MODE: "1" }).name).toBe("mock");
  });

  it("uses an OpenAI-compatible server when LLM_BASE_URL is set", () => {
    const p = getProvider({ LLM_BASE_URL: "http://droplet:8000/v1", LLM_MODEL: "google/gemma-3n-E4B-it" });
    expect(p.name).toBe("openai");
    expect(p.model).toBe("google/gemma-3n-E4B-it");
  });

  it("ignores client overrides in production unless allowed", () => {
    const o = { provider: "mock" as const };
    expect(getProvider({ NODE_ENV: "production" }, o).name).toBe("ollama");
    expect(getProvider({ NODE_ENV: "production", ALLOW_MODEL_OVERRIDE: "1" }, o).name).toBe("mock");
  });
});
