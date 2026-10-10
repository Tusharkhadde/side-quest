import { describe, expect, it } from "vitest";
import { QuestDraftSchema, VerdictSchema } from "@/lib/types";
import { extractJson } from "@/lib/llm/json";
import { questSchemaFor } from "@/lib/agent/quest";
import type { QuestContext } from "@/lib/types";

const valid = {
  title: "Three Shades of Leaf",
  placeId: "way/101",
  intro: "Walk to the park and look for colour.",
  steps: [
    { kind: "move", text: "Walk to the biggest tree." },
    { kind: "collect", text: "Find three fallen leaves." },
    { kind: "notice", text: "Count four sounds." }
  ],
  safety: "Stay on the paths.",
  proof: "Three leaves in your palm.",
  durationMinutes: 20,
  indoorAdjacent: false
};

describe("quest JSON validation", () => {
  it("accepts a well-formed quest", () => {
    expect(QuestDraftSchema.safeParse(valid).success).toBe(true);
  });

  it("requires exactly three steps", () => {
    expect(QuestDraftSchema.safeParse({ ...valid, steps: valid.steps.slice(0, 2) }).success).toBe(false);
    expect(QuestDraftSchema.safeParse({ ...valid, steps: [...valid.steps, valid.steps[0]] }).success).toBe(false);
  });

  it("rejects unknown step kinds and missing proof", () => {
    const badKind = { ...valid, steps: [{ kind: "dance", text: "Dance wildly now." }, ...valid.steps.slice(1)] };
    expect(QuestDraftSchema.safeParse(badKind).success).toBe(false);
    const { proof: _proof, ...noProof } = valid;
    void _proof;
    expect(QuestDraftSchema.safeParse(noProof).success).toBe(false);
  });

  it("defaults indoorAdjacent to false", () => {
    const { indoorAdjacent: _i, ...rest } = valid;
    void _i;
    const parsed = QuestDraftSchema.parse(rest);
    expect(parsed.indoorAdjacent).toBe(false);
  });

  it("context-aware schema enforces candidate ids and indoor mode", () => {
    const ctx: QuestContext = {
      weather: null,
      places: [{ id: "home", name: "Balcony", kind: "home", lat: 0, lon: 0, distanceMeters: 0, walkMinutes: 0 }],
      conditions: "rain",
      questMinutes: 20,
      localTime: "16:00",
      screenMinutes: 100
    };
    const schema = questSchemaFor(ctx);
    const res = schema.safeParse(valid);
    expect(res.success).toBe(false);
    const paths = res.success ? [] : res.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("placeId");
    expect(paths).toContain("indoorAdjacent");
    expect(schema.safeParse({ ...valid, placeId: "home", indoorAdjacent: true }).success).toBe(true);
  });

  it("validates photo verdicts", () => {
    expect(VerdictSchema.safeParse({ pass: true, comment: "Lovely leaves.", confidence: 0.9 }).success).toBe(true);
    expect(VerdictSchema.safeParse({ pass: "yes", comment: "x" }).success).toBe(false);
  });
});

describe("extractJson", () => {
  it("handles fenced replies and chatter", () => {
    expect(extractJson('Sure! ```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a":{"b":2}} hope that helps')).toEqual({ a: { b: 2 } });
  });

  it("throws when there is no object", () => {
    expect(() => extractJson("I cannot do that")).toThrow();
  });
});
