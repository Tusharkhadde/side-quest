import type { CompletionRequest, LLMProvider } from "./types";
import { LLMError } from "./types";

/** Ollama's native /api/chat. Default: gemma3n:e4b for text, a vision Gemma for photos. */
export class OllamaProvider implements LLMProvider {
  readonly name = "ollama" as const;
  constructor(
    readonly baseUrl: string,
    readonly model: string,
    readonly visionModel: string,
    private fetchImpl: typeof fetch = fetch,
    private timeoutMs = 120_000
  ) {}

  async complete(req: CompletionRequest): Promise<string> {
    const hasImages = Boolean(req.images?.length);
    const body = {
      model: hasImages ? this.visionModel : this.model,
      stream: false,
      format: "json",
      options: { temperature: req.temperature ?? 0.8 },
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.prompt, ...(hasImages ? { images: req.images } : {}) }
      ]
    };
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (e) {
      throw new LLMError(`Could not reach Ollama at ${this.baseUrl}. Is \`ollama serve\` running?`, e);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new LLMError(`Ollama returned ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { message?: { content?: string } };
    return json.message?.content ?? "";
  }
}
