import type { CompletionRequest, LLMProvider, ProviderId } from "./types";
import { LLMError, hostOf, httpError } from "./types";

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface OpenAICompatibleOptions {
  id?: Extract<ProviderId, "do-gradient" | "openai" | "ollama">;
  service?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Any OpenAI-compatible /chat/completions endpoint serving an open-weight model:
 * DigitalOcean serverless inference, OpenRouter, Groq, Hugging Face, or vLLM /
 * llama.cpp / Ollama on your own GPU Droplet.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly id: Extract<ProviderId, "do-gradient" | "openai" | "ollama">;
  readonly service: string;
  readonly host: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private jsonMode = true;

  constructor(
    readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    readonly model: string,
    readonly visionModel: string | null,
    opts: OpenAICompatibleOptions = {}
  ) {
    this.id = opts.id ?? "openai";
    this.service = opts.service ?? "OpenAI-compatible server";
    this.host = hostOf(baseUrl);
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  buildBody(req: CompletionRequest): Record<string, unknown> {
    const images = req.images ?? [];
    const hasImages = images.length > 0;
    const userContent: string | Part[] = hasImages
      ? [
          { type: "text", text: req.prompt },
          ...images.map<Part>((b64) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }))
        ]
      : req.prompt;
    return {
      model: hasImages ? this.visionModel : this.model,
      temperature: req.temperature ?? 0.8,
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: userContent }
      ],
      ...(this.jsonMode ? { response_format: { type: "json_object" } } : {})
    };
  }

  private async post(body: Record<string, unknown>): Promise<Response> {
    try {
      return await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (e) {
      throw new LLMError(`Could not reach ${this.service} at ${this.host}`, e);
    }
  }

  async complete(req: CompletionRequest): Promise<string> {
    if (req.images?.length && !this.visionModel) throw new LLMError(`${this.service} has no vision model configured`);
    let res = await this.post(this.buildBody(req));
    // Some servers do not implement response_format; retry once without it and remember.
    if (res.status === 400 && this.jsonMode) {
      this.jsonMode = false;
      res = await this.post(this.buildBody(req));
    }
    if (!res.ok) throw await httpError(this.service, res);
    const json = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
    const text = json.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new LLMError(`${this.service} returned an empty reply`);
    return text;
  }
}
