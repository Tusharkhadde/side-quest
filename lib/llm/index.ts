import { DEFAULT_GEMMA_MODEL, GoogleGemmaProvider } from "./google";
import { MockProvider } from "./mock";
import { OllamaProvider } from "./ollama";
import { OpenAICompatibleProvider } from "./openai";
import { modelLabel } from "./labels";
import { PROVIDER_IDS, type LLMProvider, type ProviderId } from "./types";

export type { LLMProvider, CompletionRequest, ProviderId } from "./types";
export { LLMError, PROVIDER_IDS } from "./types";
export { generateWithFallback, ChainError, type ModelCall, type ChainResult } from "./chain";
export { DEFAULT_GEMMA_MODEL };
export { modelLabel } from "./labels";

/** DigitalOcean serverless inference (OpenAI-compatible). */
export const DO_INFERENCE_URL = "https://inference.do-ai.run/v1";
/** Gemma 4 31B, hosted by DigitalOcean on its own GPUs. */
export const DEFAULT_DO_MODEL = "gemma-4-31B-it";
/** NVIDIA's open-weight vision-language model on DigitalOcean. */
export const DEFAULT_DO_VISION_MODEL = "nemotron-nano-12b-v2-vl";
export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_MODEL = "gemma3n:e4b";
export const DEFAULT_OLLAMA_VISION_MODEL = "gemma4:e4b";

/** Hosted open-weight models first, the built-in demo model last so the app always answers. */
export const DEFAULT_CHAIN: ProviderId[] = ["gemma-google", "do-gradient", "demo"];

export type ModelPreference = ProviderId;

type Env = Record<string, string | undefined>;

const LEGACY: Record<string, ProviderId> = {
  mock: "demo",
  ollama: "ollama",
  openai: "openai",
  google: "gemma-google",
  gemma: "gemma-google",
  do: "do-gradient",
  gradient: "do-gradient"
};

export function isDemoMode(env: Env = process.env): boolean {
  return env.DEMO_MODE === "1" || env.DEMO_MODE === "true" || env.LLM_PROVIDER === "mock" || env.LLM_PROVIDERS?.trim() === "demo";
}

/** "gemma-google, do-gradient,demo" -> ids, unknown names dropped, duplicates removed. */
export function parseChain(value: string | undefined): ProviderId[] {
  if (!value?.trim()) return [];
  const out: ProviderId[] = [];
  for (const raw of value.split(/[,\s]+/)) {
    const name = raw.trim().toLowerCase();
    if (!name) continue;
    const id = (PROVIDER_IDS as readonly string[]).includes(name) ? (name as ProviderId) : LEGACY[name];
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export function chainFromEnv(env: Env = process.env, kind: "text" | "vision" = "text"): ProviderId[] {
  if (isDemoMode(env)) return ["demo"];
  const explicit = parseChain(kind === "vision" ? env.VISION_PROVIDERS || env.LLM_PROVIDERS : env.LLM_PROVIDERS);
  if (explicit.length) return explicit;
  // Older single-provider config still works.
  const legacy = parseChain(env.LLM_PROVIDER);
  if (legacy.length) return [...legacy, "demo"];
  return DEFAULT_CHAIN;
}

const none = (v: string | undefined) => (v && v.toLowerCase() !== "none" ? v : null);

export function googleKey(env: Env = process.env): string | undefined {
  // Google's own client libraries prefer GOOGLE_API_KEY when both are set.
  return env.GOOGLE_API_KEY || env.GEMINI_API_KEY || undefined;
}

export function doKey(env: Env = process.env): string | undefined {
  return env.DO_MODEL_ACCESS_KEY || env.MODEL_ACCESS_KEY || env.GRADIENT_MODEL_ACCESS_KEY || undefined;
}

export interface BuildOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Build one provider from env, or null when it is not configured (missing key or URL). */
export function buildProvider(id: ProviderId, env: Env = process.env, opts: BuildOptions = {}): LLMProvider | null {
  const fetchImpl = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeoutMs = opts.timeoutMs ?? 30_000;
  switch (id) {
    case "gemma-google": {
      const key = googleKey(env);
      if (!key) return null;
      const model = env.GEMMA_MODEL || DEFAULT_GEMMA_MODEL;
      const vision = env.GEMMA_VISION_MODEL === undefined || env.GEMMA_VISION_MODEL === "" ? model : none(env.GEMMA_VISION_MODEL);
      return new GoogleGemmaProvider(key, model, vision, fetchImpl, timeoutMs, env.GEMINI_API_BASE || undefined);
    }
    case "do-gradient": {
      const key = doKey(env);
      if (!key) return null;
      const vision = env.DO_VISION_MODEL === undefined || env.DO_VISION_MODEL === "" ? DEFAULT_DO_VISION_MODEL : none(env.DO_VISION_MODEL);
      return new OpenAICompatibleProvider(env.DO_INFERENCE_URL || DO_INFERENCE_URL, key, env.DO_MODEL || DEFAULT_DO_MODEL, vision, {
        id: "do-gradient",
        service: "DigitalOcean serverless inference",
        fetchImpl,
        timeoutMs
      });
    }
    case "openai": {
      if (!env.LLM_BASE_URL) return null;
      const model = env.LLM_MODEL || "google/gemma-3-27b-it";
      const vision = env.LLM_VISION_MODEL === undefined || env.LLM_VISION_MODEL === "" ? model : none(env.LLM_VISION_MODEL);
      return new OpenAICompatibleProvider(env.LLM_BASE_URL, env.LLM_API_KEY || undefined, model, vision, {
        id: "openai",
        service: "OpenAI-compatible server",
        fetchImpl,
        timeoutMs
      });
    }
    case "ollama":
      return new OllamaProvider(
        env.OLLAMA_URL || DEFAULT_OLLAMA_URL,
        env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL,
        env.OLLAMA_VISION_MODEL === undefined || env.OLLAMA_VISION_MODEL === ""
          ? DEFAULT_OLLAMA_VISION_MODEL
          : none(env.OLLAMA_VISION_MODEL),
        fetchImpl,
        Math.max(timeoutMs, 120_000)
      );
    case "demo":
      return new MockProvider();
  }
}

export function timeoutFor(kind: "text" | "vision", env: Env = process.env): number {
  const raw = Number(kind === "vision" ? env.VISION_TIMEOUT_MS : env.LLM_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : kind === "vision" ? 45_000 : 25_000;
}

/**
 * The configured providers, in order. A preference from Settings only moves an
 * already-configured provider to the front; it can never add a URL or a key.
 */
export function resolveChain(
  env: Env = process.env,
  opts: { kind?: "text" | "vision"; prefer?: ModelPreference | null } & BuildOptions = {}
): LLMProvider[] {
  const kind = opts.kind ?? "text";
  const ids = chainFromEnv(env, kind);
  const ordered = opts.prefer && ids.includes(opts.prefer) ? [opts.prefer, ...ids.filter((i) => i !== opts.prefer)] : ids;
  const timeoutMs = opts.timeoutMs ?? timeoutFor(kind, env);
  return ordered.map((id) => buildProvider(id, env, { ...opts, timeoutMs })).filter((p): p is LLMProvider => p !== null);
}

export const SERVICE_NAMES: Record<ProviderId, string> = {
  "gemma-google": "Google Gemini API",
  "do-gradient": "DigitalOcean serverless inference",
  openai: "OpenAI-compatible server",
  ollama: "Ollama (self-hosted)",
  demo: "Built-in demo model (no network)"
};

export interface ProviderInfo {
  id: ProviderId;
  service: string;
  host: string;
  model: string;
  modelLabel: string;
  visionModel: string | null;
  visionLabel: string | null;
  configured: boolean;
}

/** For /api/health and the Settings page. Never includes keys. */
export function describeChain(env: Env = process.env, kind: "text" | "vision" = "text"): ProviderInfo[] {
  return chainFromEnv(env, kind).map((id) => {
    const p = buildProvider(id, env);
    return {
      id,
      service: p?.service ?? SERVICE_NAMES[id],
      host: p?.host ?? "",
      model: p?.model ?? "",
      modelLabel: p ? modelLabel(p.model) : "",
      visionModel: p?.visionModel ?? null,
      visionLabel: p?.visionModel ? modelLabel(p.visionModel) : null,
      configured: p !== null
    };
  });
}
