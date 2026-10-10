import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GoogleGemmaProvider } from "@/lib/llm/google";
import { OpenAICompatibleProvider } from "@/lib/llm/openai";
import { generateWithFallback } from "@/lib/llm/chain";
import { extractJson } from "@/lib/llm/json";
import { describeChain, modelLabel, parseChain, resolveChain } from "@/lib/llm";
import type { LLMProvider } from "@/lib/llm/types";

interface Captured {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

/** A fake fetch that records requests and replays canned responses in order. */
function fakeFetch(responses: { status?: number; json: unknown }[]) {
  const calls: Captured[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {}, body: JSON.parse(String(init?.body ?? "{}")) });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

const gemmaReply = (text: string) => ({ candidates: [{ content: { parts: [{ text: "thinking...", thought: true }, { text }] }, finishReason: "STOP" }] });

describe("Gemma on the Gemini API", () => {
  it("sends system instruction, JSON mode and minimal thinking to generateContent", async () => {
    const f = fakeFetch([{ json: gemmaReply('{"ok":true}') }]);
    const p = new GoogleGemmaProvider("test-key", "gemma-4-26b-a4b-it", "gemma-4-26b-a4b-it", f.impl);
    const out = await p.complete({ system: "SYS", prompt: "Write a quest", temperature: 0.5 });
    expect(out).toBe('{"ok":true}'); // thought parts are dropped
    const c = f.calls[0];
    expect(c.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemma-4-26b-a4b-it:generateContent");
    expect((c.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    expect(c.url).not.toContain("test-key");
    expect(c.body.systemInstruction).toEqual({ parts: [{ text: "SYS" }] });
    expect(c.body.contents).toEqual([{ role: "user", parts: [{ text: "Write a quest" }] }]);
    expect(c.body.generationConfig).toMatchObject({ temperature: 0.5, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "minimal" } });
  });

  it("sends photos as inline JPEG parts after the text, to the vision model", async () => {
    const f = fakeFetch([{ json: gemmaReply('{"pass":true}') }]);
    const p = new GoogleGemmaProvider("k", "gemma-text", "gemma-vision", f.impl);
    await p.complete({ system: "S", prompt: "Does it show a leaf?", images: ["QUJD"] });
    expect(f.calls[0].url).toContain("/models/gemma-vision:generateContent");
    const parts = (f.calls[0].body.contents as { parts: unknown[] }[])[0].parts;
    expect(parts).toEqual([{ text: "Does it show a leaf?" }, { inlineData: { mimeType: "image/jpeg", data: "QUJD" } }]);
  });

  it("falls back to a plain request (system folded into the user turn) on a 400, and remembers", async () => {
    const f = fakeFetch([
      { status: 400, json: { error: { message: "Developer instruction is not enabled for models/gemma" } } },
      { json: gemmaReply('{"a":1}') },
      { json: gemmaReply('{"b":2}') }
    ]);
    const p = new GoogleGemmaProvider("k", "gemma-3-27b-it", "gemma-3-27b-it", f.impl);
    expect(await p.complete({ system: "SYS", prompt: "P" })).toBe('{"a":1}');
    const plain = f.calls[1].body;
    expect(plain.systemInstruction).toBeUndefined();
    expect((plain.generationConfig as Record<string, unknown>).responseMimeType).toBeUndefined();
    expect((plain.contents as { parts: { text: string }[] }[])[0].parts[0].text).toBe("SYS\n\n---\n\nP");
    expect(p.usingPlainRequests).toBe(true);
    await p.complete({ system: "SYS", prompt: "Q" });
    expect(f.calls).toHaveLength(3);
    expect(f.calls[2].body.systemInstruction).toBeUndefined();
  });

  it("does not retry a bad API key", async () => {
    const f = fakeFetch([{ status: 400, json: { error: { message: "API key not valid. Please pass a valid API key." } } }]);
    const p = new GoogleGemmaProvider("bad", "gemma-4-26b-a4b-it", null, f.impl);
    await expect(p.complete({ system: "S", prompt: "P" })).rejects.toThrow(/API key not valid/);
    expect(f.calls).toHaveLength(1);
  });

  it("treats blocked or empty replies as failures so the chain moves on", async () => {
    const blocked = fakeFetch([{ json: { promptFeedback: { blockReason: "SAFETY" } } }]);
    await expect(new GoogleGemmaProvider("k", "m", "m", blocked.impl).complete({ system: "S", prompt: "P" })).rejects.toThrow(/SAFETY/);
    const empty = fakeFetch([{ json: { candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] } }]);
    await expect(new GoogleGemmaProvider("k", "m", "m", empty.impl).complete({ system: "S", prompt: "P" })).rejects.toThrow(/empty/);
  });
});

describe("DigitalOcean serverless inference (OpenAI-compatible)", () => {
  const reply = (content: string) => ({ choices: [{ message: { content } }] });

  it("posts chat completions with a bearer key and an image_url data URI", async () => {
    const f = fakeFetch([{ json: reply('{"pass":false}') }]);
    const p = new OpenAICompatibleProvider("https://inference.do-ai.run/v1", "do-key", "gemma-4-31B-it", "nemotron-nano-12b-v2-vl", {
      id: "do-gradient",
      service: "DigitalOcean serverless inference",
      fetchImpl: f.impl
    });
    expect(p.host).toBe("inference.do-ai.run");
    await p.complete({ system: "S", prompt: "Check", images: ["QUJD"] });
    const c = f.calls[0];
    expect(c.url).toBe("https://inference.do-ai.run/v1/chat/completions");
    expect((c.init.headers as Record<string, string>).Authorization).toBe("Bearer do-key");
    expect(c.body.model).toBe("nemotron-nano-12b-v2-vl");
    expect(c.body.messages).toEqual([
      { role: "system", content: "S" },
      {
        role: "user",
        content: [
          { type: "text", text: "Check" },
          { type: "image_url", image_url: { url: "data:image/jpeg;base64,QUJD" } }
        ]
      }
    ]);
    expect(c.body.response_format).toEqual({ type: "json_object" });
  });

  it("retries once without response_format when the server rejects it", async () => {
    const f = fakeFetch([{ status: 400, json: { error: "response_format not supported" } }, { json: reply("{}") }]);
    const p = new OpenAICompatibleProvider("http://x/v1", undefined, "m", null, { fetchImpl: f.impl });
    await p.complete({ system: "S", prompt: "P" });
    expect(f.calls[1].body.response_format).toBeUndefined();
    expect((f.calls[1].init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("refuses image requests when no vision model is configured", async () => {
    const f = fakeFetch([{ json: reply("{}") }]);
    const p = new OpenAICompatibleProvider("http://x/v1", "k", "gpt-oss", null, { fetchImpl: f.impl });
    await expect(p.complete({ system: "S", prompt: "P", images: ["x"] })).rejects.toThrow(/no vision model/);
    expect(f.calls).toHaveLength(0);
  });
});

describe("provider chain from env", () => {
  const ids = (ps: LLMProvider[]) => ps.map((p) => p.id);

  it("defaults to Gemma, then DigitalOcean, then the demo model, skipping what has no key", () => {
    expect(ids(resolveChain({}))).toEqual(["demo"]);
    expect(ids(resolveChain({ GOOGLE_API_KEY: "g" }))).toEqual(["gemma-google", "demo"]);
    expect(ids(resolveChain({ GEMINI_API_KEY: "g", DO_MODEL_ACCESS_KEY: "d" }))).toEqual(["gemma-google", "do-gradient", "demo"]);
  });

  it("uses Gemma 4 on Google and Gemma 4 + an open VLM on DigitalOcean by default", () => {
    const [g, d] = resolveChain({ GOOGLE_API_KEY: "g", MODEL_ACCESS_KEY: "d" });
    expect([g.model, g.visionModel]).toEqual(["gemma-4-26b-a4b-it", "gemma-4-26b-a4b-it"]);
    expect([d.model, d.visionModel, d.host]).toEqual(["gemma-4-31B-it", "nemotron-nano-12b-v2-vl", "inference.do-ai.run"]);
  });

  it("parses LLM_PROVIDERS, drops unknown names and honours a Settings preference", () => {
    expect(parseChain("gemma-google, do-gradient ,nope,demo,demo")).toEqual(["gemma-google", "do-gradient", "demo"]);
    const env = { LLM_PROVIDERS: "gemma-google,do-gradient,demo", GOOGLE_API_KEY: "g", DO_MODEL_ACCESS_KEY: "d" };
    expect(ids(resolveChain(env, { prefer: "do-gradient" }))).toEqual(["do-gradient", "gemma-google", "demo"]);
    // A preference can only reorder configured providers, never add one.
    expect(ids(resolveChain({ GOOGLE_API_KEY: "g" }, { prefer: "ollama" }))).toEqual(["gemma-google", "demo"]);
  });

  it("supports a separate vision chain, demo mode, self-hosting and the old single-provider env", () => {
    const env = { GOOGLE_API_KEY: "g", DO_MODEL_ACCESS_KEY: "d", VISION_PROVIDERS: "do-gradient" };
    expect(ids(resolveChain(env, { kind: "vision" }))).toEqual(["do-gradient"]);
    expect(ids(resolveChain({ ...env, DEMO_MODE: "1" }))).toEqual(["demo"]);
    expect(ids(resolveChain({ LLM_PROVIDERS: "ollama" }))).toEqual(["ollama"]);
    expect(ids(resolveChain({ LLM_PROVIDER: "ollama" }))).toEqual(["ollama", "demo"]);
    expect(resolveChain({ DO_MODEL_ACCESS_KEY: "d", DO_VISION_MODEL: "none", LLM_PROVIDERS: "do-gradient" })[0].visionModel).toBeNull();
  });

  it("describes the chain for /api/health without leaking keys", () => {
    const info = describeChain({ GOOGLE_API_KEY: "super-secret", LLM_PROVIDERS: "gemma-google,do-gradient,demo" });
    expect(JSON.stringify(info)).not.toContain("super-secret");
    expect(info.map((i) => [i.id, i.configured])).toEqual([
      ["gemma-google", true],
      ["do-gradient", false],
      ["demo", true]
    ]);
    expect(info[0].modelLabel).toBe("Gemma 4 26B A4B");
  });

  it("names models for humans", () => {
    expect(modelLabel("gemma-4-31B-it")).toBe("Gemma 4 31B");
    expect(modelLabel("google/gemma-3-27b-it")).toBe("Gemma 3 27B");
    expect(modelLabel("some-new-model")).toBe("some-new-model");
  });
});

describe("fallback chain mechanics", () => {
  const schema = z.object({ ok: z.boolean() });
  const make = (id: LLMProvider["id"], complete: LLMProvider["complete"]): LLMProvider => ({ id, model: id, visionModel: id, host: id, service: id, complete });

  it("moves on when a provider hangs past its time budget", async () => {
    const hang = make("gemma-google", () => new Promise<string>(() => undefined));
    const ok = make("do-gradient", async () => '{"ok":true}');
    const res = await generateWithFallback([hang, ok], schema, { system: "s", prompt: "p" }, { timeoutMs: 30 });
    expect(res.provider.id).toBe("do-gradient");
    expect(res.calls[0]).toMatchObject({ provider: "gemma-google", ok: false });
    expect(res.calls[0].error).toMatch(/timed out/);
  });

  it("moves on when a provider keeps returning invalid JSON", async () => {
    const junk = make("gemma-google", async () => "no json here");
    const ok = make("demo", async () => '{"ok":true}');
    const res = await generateWithFallback([junk, ok], schema, { system: "s", prompt: "p" }, { maxAttempts: 2 });
    expect(res.provider.id).toBe("demo");
    expect(res.calls[0].error).toContain("after 2 attempts");
  });
});

describe("JSON repair", () => {
  it("handles fences, chatter, trailing commas and smart quotes", () => {
    expect(extractJson('Here you go:\n```json\n{"a": 1,}\n```')).toEqual({ a: 1 });
    expect(extractJson("Sure! {\u201Ctitle\u201D: \u201CLeaf hunt\u201D, \"steps\": [1, 2,],} Enjoy.")).toEqual({ title: "Leaf hunt", steps: [1, 2] });
    expect(() => extractJson("no braces")).toThrow();
  });
});
