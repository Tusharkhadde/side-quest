import { z } from "zod";
import { MockProvider } from "./mock";
import { OllamaProvider } from "./ollama";
import { OpenAICompatibleProvider } from "./openai";
import type { LLMProvider } from "./types";

export type { LLMProvider, CompletionRequest } from "./types";
export { LLMError } from "./types";

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_MODEL = "gemma3n:e4b";
/** Ollama's gemma3n build accepts text only, so photos go to a vision-capable Gemma. */
export const DEFAULT_OLLAMA_VISION_MODEL = "gemma4:e4b";

/** What the Settings page may send to point at a different model server. */
export const ModelOverrideSchema = z.object({
  provider: z.enum(["ollama", "openai", "mock"]),
  url: z.string().url().optional(),
  model: z.string().min(1).max(120).optional(),
  visionModel: z.string().min(1).max(120).optional(),
  apiKey: z.string().max(400).optional()
});
export type ModelOverride = z.infer<typeof ModelOverrideSchema>;

type Env = Record<string, string | undefined>;

export function isDemoMode(env: Env = process.env): boolean {
  return env.DEMO_MODE === "1" || env.DEMO_MODE === "true" || env.LLM_PROVIDER === "mock";
}

export function overrideAllowed(env: Env = process.env): boolean {
  return env.NODE_ENV !== "production" || env.ALLOW_MODEL_OVERRIDE === "1";
}

/** Build the provider from env, optionally overridden by the Settings page. */
export function getProvider(env: Env = process.env, override?: ModelOverride | null): LLMProvider {
  if (override && overrideAllowed(env)) {
    if (override.provider === "mock") return new MockProvider();
    if (override.provider === "openai" && override.url) {
      const model = override.model ?? env.LLM_MODEL ?? "gemma";
      return new OpenAICompatibleProvider(override.url, override.apiKey, model, override.visionModel ?? model);
    }
    if (override.provider === "ollama") {
      return new OllamaProvider(
        override.url ?? env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL,
        override.model ?? env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL,
        override.visionModel ?? env.OLLAMA_VISION_MODEL ?? DEFAULT_OLLAMA_VISION_MODEL
      );
    }
  }
  if (isDemoMode(env)) return new MockProvider();
  if (env.LLM_PROVIDER === "openai" || (env.LLM_BASE_URL && env.LLM_PROVIDER !== "ollama")) {
    const model = env.LLM_MODEL || "google/gemma-3n-E4B-it";
    return new OpenAICompatibleProvider(
      env.LLM_BASE_URL || "http://localhost:8000/v1",
      env.LLM_API_KEY || undefined,
      model,
      env.LLM_VISION_MODEL || model
    );
  }
  return new OllamaProvider(
    env.OLLAMA_URL || DEFAULT_OLLAMA_URL,
    env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL,
    env.OLLAMA_VISION_MODEL || DEFAULT_OLLAMA_VISION_MODEL
  );
}
