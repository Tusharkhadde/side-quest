import { describe, expect, it } from "vitest";
import { MockProvider } from "@/lib/llm/mock";
import type { CompletionRequest, LLMProvider } from "@/lib/llm/types";
import { buildCandidates, runQuestAgent } from "@/lib/agent/quest";
import { verifyPhoto } from "@/lib/agent/verify";
import { parseOverpass } from "@/lib/context/places";
import { buildQuestPrompt } from "@/lib/agent/prompts";
import { blurForServer, questDisclosure } from "@/lib/client/questFlow";
import { demoPlaces, demoWeather, DEMO_ORIGIN } from "@/lib/demo/sample";
import { classifyConditions } from "@/lib/context/weather";
import fixture from "./fixtures/overpass.json";
import type { OverpassElement } from "@/lib/context/places";
import type { QuestContext } from "@/lib/types";

const origin = { lat: 18.6298, lon: 73.7997 };
const places = parseOverpass(fixture as unknown as { elements: OverpassElement[] }, origin);

function ctxFor(conditions: QuestContext["conditions"]): QuestContext {
  const candidates = buildCandidates({ places, conditions, questMinutes: 20 }, origin);
  return { weather: null, places: candidates, conditions, questMinutes: 20, localTime: "16:30", screenMinutes: 95 };
}

function fake(id: LLMProvider["id"], complete: (req: CompletionRequest) => Promise<string>, visionModel: string | null = "v"): LLMProvider {
  return { id, model: `${id}-model`, visionModel, host: `${id}.example`, service: `${id} service`, complete };
}

describe("agent loop with the demo model", () => {
  it("produces a valid outdoor quest at a real candidate", async () => {
    const ctx = ctxFor("good");
    const q = await runQuestAgent({ ctx, providers: [new MockProvider()], now: new Date("2026-10-10T11:00:00Z") });
    expect(q.source).toBe("model");
    expect(q.steps).toHaveLength(3);
    expect(ctx.places.map((p) => p.id)).toContain(q.placeId);
    expect(q.indoorAdjacent).toBe(false);
    expect(q.durationMinutes).toBe(20);
    expect(q.modelUsed?.provider).toBe("demo");
    expect(q.model).toBe("Side Quest demo model");
  });

  it("is deterministic for the same context", async () => {
    const a = await runQuestAgent({ ctx: ctxFor("good"), providers: [new MockProvider()], id: "x" });
    const b = await runQuestAgent({ ctx: ctxFor("good"), providers: [new MockProvider()], id: "x" });
    expect(a.title).toBe(b.title);
    expect(a.placeId).toBe(b.placeId);
  });

  it("switches to an indoor-adjacent quest in the rain", async () => {
    const ctx = ctxFor("rain");
    expect(ctx.places.map((p) => p.id)).toEqual(["home"]);
    const q = await runQuestAgent({ ctx, providers: [new MockProvider()] });
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
    const flaky = fake("gemma-google", async (req) => {
      prompts.push(req.prompt);
      call += 1;
      if (call === 1) return "Sure, here is a quest about trees!";
      return new MockProvider().complete(req);
    });
    const q = await runQuestAgent({ ctx: ctxFor("good"), providers: [flaky] });
    expect(q.source).toBe("model");
    expect(call).toBe(2);
    expect(prompts[1]).toContain("previous reply was invalid");
    expect(q.note).toContain("2 tries");
    expect(q.modelUsed?.provider).toBe("gemma-google");
  });

  it("falls through the chain to the next open model", async () => {
    const down = fake("gemma-google", async () => {
      throw new Error("Google Gemini API returned 429: quota");
    });
    const q = await runQuestAgent({ ctx: ctxFor("good"), providers: [down, new MockProvider()] });
    expect(q.source).toBe("model");
    expect(q.modelUsed?.provider).toBe("demo");
    expect(q.calls?.map((c) => [c.provider, c.ok])).toEqual([
      ["gemma-google", false],
      ["demo", true]
    ]);
    expect(q.calls?.[0].error).toContain("429");
  });

  it("falls back to a built-in quest when every model is down", async () => {
    const down = fake("gemma-google", async () => {
      throw new Error("connect ECONNREFUSED");
    });
    const q = await runQuestAgent({ ctx: ctxFor("good"), providers: [down] });
    expect(q.source).toBe("fallback");
    expect(q.model).toBe("built-in quest");
    expect(q.steps).toHaveLength(3);
    expect(q.calls).toHaveLength(1);
  });

  it("never puts the user's coordinates in the prompt", () => {
    const ctx = ctxFor("good");
    const prompt = buildQuestPrompt(ctx, ctx.places);
    expect(prompt).not.toContain(String(origin.lat));
    expect(prompt).not.toContain("lat");
  });

  it("verifies photos through the same structured pipeline", async () => {
    const m = [new MockProvider()];
    const ok = await verifyPhoto(m, { imageBase64: "a".repeat(5000), proof: "three leaves", questTitle: "Leaves" });
    expect(ok.verdict.pass).toBe(true);
    expect(ok.modelUsed.provider).toBe("demo");
    const bad = await verifyPhoto(m, { imageBase64: "a".repeat(20), proof: "three leaves", questTitle: "Leaves" });
    expect(bad.verdict.pass).toBe(false);
  });

  it("skips providers with no vision model for photo checks", async () => {
    const textOnly = fake("do-gradient", async () => {
      throw new Error("should not be called");
    }, null);
    const res = await verifyPhoto([textOnly, new MockProvider()], { imageBase64: "a".repeat(5000), proof: "a leaf", questTitle: "Leaf" });
    expect(res.modelUsed.provider).toBe("demo");
    expect(res.calls.map((c) => c.provider)).toEqual(["demo"]);
  });
});

describe("privacy on the way out", () => {
  it("rounds candidate distances so they cannot be used to trilaterate the user", () => {
    const p = { id: "way/1", name: "Park", kind: "park" as const, lat: 1, lon: 2, distanceMeters: 1137, walkMinutes: 17 };
    expect(blurForServer(p)).toMatchObject({ distanceMeters: 1250, walkMinutes: 15 });
    expect(blurForServer({ ...p, distanceMeters: 40, walkMinutes: 1 })).toMatchObject({ distanceMeters: 250, walkMinutes: 5 });
    expect(blurForServer({ ...p, id: "home", kind: "home" as const })).toMatchObject({ distanceMeters: 0, walkMinutes: 0 });
  });

  it("lists every hop in the disclosure, and nothing about location in demo mode", () => {
    const calls = [
      { provider: "gemma-google", service: "Google Gemini API", host: "generativelanguage.googleapis.com", model: "gemma-4-26b-a4b-it", ok: true, ms: 900 }
    ];
    const real = questDisclosure({ demo: false, coarse: { lat: 18.63, lon: 73.8 }, radiusM: 1500, candidates: [], screenMinutes: 95, calls });
    expect(real.map((d) => d.to)).toEqual([
      "api.open-meteo.com",
      "Overpass API (OpenStreetMap)",
      "This app's server (/api/quest)",
      "generativelanguage.googleapis.com (Google Gemini API)"
    ]);
    expect(real[0].what).toContain("18.63, 73.80");
    expect(real[3].why).toContain("Gemma 4 26B A4B");
    const demo = questDisclosure({ demo: true, coarse: null, radiusM: 1500, candidates: [], screenMinutes: 110, calls: [] });
    expect(demo[0].to).toBe("Nowhere");
    expect(JSON.stringify(demo)).not.toContain("open-meteo");
  });
});

describe("demo quest data", () => {
  it("has real Pune places near the sample point and good sample weather", () => {
    const p = demoPlaces();
    expect(p.length).toBeGreaterThan(10);
    expect(p[0].distanceMeters).toBeLessThan(400);
    expect(classifyConditions(demoWeather(), 20)).toBe("good");
    const c = buildCandidates({ places: p, conditions: "good", questMinutes: 20 }, DEMO_ORIGIN);
    expect(c.length).toBeGreaterThan(0);
    expect(c.every((x) => x.walkMinutes <= 7)).toBe(true);
  });
});
