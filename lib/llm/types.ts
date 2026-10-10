export interface CompletionRequest {
  system: string;
  prompt: string;
  /** Base64 JPEG/PNG payloads without the data: prefix. */
  images?: string[];
  temperature?: number;
}

export interface LLMProvider {
  readonly name: "ollama" | "openai" | "mock";
  /** Model used for text (quest writing). */
  readonly model: string;
  /** Model used when the request carries images (photo checks). */
  readonly visionModel: string;
  complete(req: CompletionRequest): Promise<string>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown
  ) {
    super(message);
    this.name = "LLMError";
  }
}
