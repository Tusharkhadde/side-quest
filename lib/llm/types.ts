/** Every model backend Side Quest knows. All of them serve open-weight models. */
export const PROVIDER_IDS = ["gemma-google", "do-gradient", "openai", "ollama", "demo"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface CompletionRequest {
  system: string;
  prompt: string;
  /** Base64 JPEG payloads without the data: prefix. */
  images?: string[];
  temperature?: number;
}

export interface LLMProvider {
  readonly id: ProviderId;
  /** Model used for text (quest writing). */
  readonly model: string;
  /** Model used when the request carries images, or null if this backend has no open vision model. */
  readonly visionModel: string | null;
  /** Where requests go, shown in the "what left your device" panel. */
  readonly host: string;
  /** Human name of the service, e.g. "Google Gemini API". */
  readonly service: string;
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

/** Hostname of a base URL, for display. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Short error text from a failed HTTP call, without echoing anything secret. */
export async function httpError(service: string, res: Response): Promise<LLMError> {
  const text = await res.text().catch(() => "");
  let message = text.slice(0, 300);
  try {
    const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    message = (typeof j.error === "string" ? j.error : j.error?.message) ?? j.message ?? message;
  } catch {
    // not JSON
  }
  return new LLMError(`${service} returned ${res.status}${message ? `: ${message.slice(0, 200)}` : ""}`, { status: res.status });
}

export function statusOf(e: unknown): number | undefined {
  if (e instanceof LLMError && e.detail && typeof e.detail === "object" && "status" in e.detail) {
    return (e.detail as { status?: number }).status;
  }
  return undefined;
}
