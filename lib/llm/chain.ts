import type { ZodType, ZodTypeDef } from "zod";
import type { ModelCall } from "../types";
import { generateStructured } from "./json";
import type { CompletionRequest, LLMProvider } from "./types";
import { LLMError } from "./types";

export type { ModelCall };

export interface ChainResult<T> {
  data: T;
  provider: LLMProvider;
  model: string;
  attempts: number;
  calls: ModelCall[];
}

export class ChainError extends LLMError {
  constructor(
    message: string,
    readonly calls: ModelCall[]
  ) {
    super(message);
    this.name = "ChainError";
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new LLMError(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export interface ChainOptions {
  /** Zod repair attempts per provider. */
  maxAttempts?: number;
  /** Wall-clock budget per provider, repairs included. */
  timeoutMs?: number;
  now?: () => number;
}

/**
 * Try each open model in order until one returns JSON that passes the schema.
 * Providers without a vision model are skipped for image requests.
 */
export async function generateWithFallback<T>(
  providers: LLMProvider[],
  schema: ZodType<T, ZodTypeDef, unknown>,
  req: CompletionRequest,
  opts: ChainOptions = {}
): Promise<ChainResult<T>> {
  const { maxAttempts = 3, timeoutMs = 25_000, now = Date.now } = opts;
  const needsVision = Boolean(req.images?.length);
  const calls: ModelCall[] = [];
  const usable = providers.filter((p) => !needsVision || p.visionModel);
  if (!usable.length) {
    throw new ChainError(needsVision ? "No vision-capable model is configured" : "No model is configured", calls);
  }
  for (const provider of usable) {
    const model = (needsVision ? provider.visionModel : provider.model) ?? provider.model;
    const started = now();
    try {
      const res = await withTimeout(generateStructured(provider, schema, req, maxAttempts), timeoutMs, provider.service);
      calls.push({ provider: provider.id, service: provider.service, host: provider.host, model, ok: true, ms: now() - started, tries: res.attempts });
      return { data: res.data, provider, model, attempts: res.attempts, calls };
    } catch (e) {
      calls.push({
        provider: provider.id,
        service: provider.service,
        host: provider.host,
        model,
        ok: false,
        ms: now() - started,
        error: (e instanceof Error ? e.message : String(e)).slice(0, 200)
      });
    }
  }
  throw new ChainError(`Every model in the chain failed: ${calls.map((c) => `${c.provider}: ${c.error}`).join(" | ")}`, calls);
}
