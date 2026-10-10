import type { CompletionRequest, LLMProvider } from "./types";
import { LLMError, hostOf, httpError } from "./types";

/** Optional self-host path: Ollama's native /api/chat on your own machine or GPU Droplet. */
export class OllamaProvider implements LLMProvider {
  readonly id = "ollama" as const;
  readonly service = "Ollama (self-hosted)";
  readonly host: string;
  constructor(
    readonly baseUrl: string,
    readonly model: string,
    readonly visionModel: string | null,
    private fetchImpl: typeof fetch = fetch,
    private timeoutMs = 120_000
  ) {
    this.host = hostOf(baseUrl);
  }

  async complete(req: CompletionRequest): Promise<string> {
    const hasImages = Boolean(req.images?.length);
    if (hasImages && !this.visionModel) throw new LLMError("No Ollama vision model configured");
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
    if (!res.ok) throw await httpError(this.service, res);
    const json = (await res.json()) as { message?: { content?: string } };
    return json.message?.content ?? "";
  }
}
