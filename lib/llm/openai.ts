import type { CompletionRequest, LLMProvider } from "./types";
import { LLMError } from "./types";

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

/**
 * Any OpenAI-compatible chat endpoint serving Gemma: vLLM, llama.cpp server,
 * LM Studio, a DigitalOcean GPU Droplet, or DigitalOcean Gradient.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = "openai" as const;
  constructor(
    readonly baseUrl: string,
    readonly apiKey: string | undefined,
    readonly model: string,
    readonly visionModel: string,
    private fetchImpl: typeof fetch = fetch,
    private timeoutMs = 120_000
  ) {}

  private post(body: Record<string, unknown>): Promise<Response> {
    return this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
  }

  async complete(req: CompletionRequest): Promise<string> {
    const hasImages = Boolean(req.images?.length);
    const userContent: string | Part[] = hasImages
      ? [
          ...(req.images ?? []).map<Part>((b64) => ({
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${b64}` }
          })),
          { type: "text", text: req.prompt }
        ]
      : req.prompt;
    const body: Record<string, unknown> = {
      model: hasImages ? this.visionModel : this.model,
      temperature: req.temperature ?? 0.8,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: userContent }
      ],
      response_format: { type: "json_object" }
    };
    let res: Response;
    try {
      res = await this.post(body);
      // Some servers do not implement response_format; retry once without it.
      if (res.status === 400) {
        delete body.response_format;
        res = await this.post(body);
      }
    } catch (e) {
      throw new LLMError(`Could not reach the model server at ${this.baseUrl}`, e);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new LLMError(`Model server returned ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content ?? "";
  }
}
