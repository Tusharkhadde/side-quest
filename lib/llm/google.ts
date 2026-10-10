import type { CompletionRequest, LLMProvider } from "./types";
import { LLMError, httpError } from "./types";

export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
/** Gemma 4 MoE: 26B total / ~4B active parameters, fast and multimodal. Open weights (Apache 2.0). */
export const DEFAULT_GEMMA_MODEL = "gemma-4-26b-a4b-it";

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/**
 * Gemma served by Google through the Gemini API (generateContent).
 * The same open weights can be downloaded and run anywhere; this is just the
 * cheapest place to call them from a hackathon app (free tier in AI Studio).
 *
 * Gemma 4 on this API accepts a system instruction, inline images and a
 * thinking level. Older Gemma builds rejected some of those, so on a 400 the
 * provider switches to a "plain" request (system prompt folded into the user
 * turn, no JSON mime type, no thinking config) and remembers that it did.
 * JSON is always validated with zod afterwards either way.
 */
export class GoogleGemmaProvider implements LLMProvider {
  readonly id = "gemma-google" as const;
  readonly service = "Google Gemini API";
  readonly host = "generativelanguage.googleapis.com";
  private plain = false;

  constructor(
    private readonly apiKey: string,
    readonly model: string = DEFAULT_GEMMA_MODEL,
    readonly visionModel: string | null = model,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 30_000,
    private readonly baseUrl = GEMINI_API_BASE
  ) {}

  /** The exact JSON body sent to generateContent (exported for tests and the README). */
  buildBody(req: CompletionRequest, plain = this.plain): Record<string, unknown> {
    const images = req.images ?? [];
    const text = plain ? `${req.system}\n\n---\n\n${req.prompt}` : req.prompt;
    // Google's guidance: with one image, put the text before the image.
    const parts: Part[] = [{ text }, ...images.map<Part>((data) => ({ inlineData: { mimeType: "image/jpeg", data } }))];
    const generationConfig: Record<string, unknown> = { temperature: req.temperature ?? 0.8, maxOutputTokens: 1024 };
    if (!plain) {
      generationConfig.responseMimeType = "application/json";
      generationConfig.thinkingConfig = { thinkingLevel: "minimal" };
    }
    return {
      ...(plain ? {} : { systemInstruction: { parts: [{ text: req.system }] } }),
      contents: [{ role: "user", parts }],
      generationConfig
    };
  }

  private async post(model: string, body: Record<string, unknown>): Promise<Response> {
    try {
      return await this.fetchImpl(`${this.baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (e) {
      throw new LLMError(`Could not reach the Gemini API (${e instanceof Error ? e.message : "network error"})`, e);
    }
  }

  async complete(req: CompletionRequest): Promise<string> {
    const hasImages = Boolean(req.images?.length);
    const model = hasImages ? this.visionModel : this.model;
    if (!model) throw new LLMError("No vision model configured for Gemma on the Gemini API");
    let res = await this.post(model, this.buildBody(req));
    if (res.status === 400 && !this.plain) {
      const err = await httpError(this.service, res);
      // A bad key is also a 400 on this API; do not mask it with a retry.
      if (/api key/i.test(err.message)) throw err;
      this.plain = true;
      res = await this.post(model, this.buildBody(req, true));
    }
    if (!res.ok) throw await httpError(this.service, res);
    const json = (await res.json()) as GenerateContentResponse;
    if (json.promptFeedback?.blockReason) throw new LLMError(`Gemma declined the request (${json.promptFeedback.blockReason})`);
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought && typeof p.text === "string")
      .map((p) => p.text)
      .join("");
    if (!text.trim()) throw new LLMError(`Gemma returned an empty reply (${json.candidates?.[0]?.finishReason ?? "no candidates"})`);
    return text;
  }

  /** For tests: whether the provider fell back to plain requests. */
  get usingPlainRequests(): boolean {
    return this.plain;
  }
}
