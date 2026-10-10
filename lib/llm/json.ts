import type { ZodType, ZodTypeDef } from "zod";
import type { CompletionRequest, LLMProvider } from "./types";
import { LLMError } from "./types";

/** Pull the first JSON object out of a model reply (handles ``` fences and chatter). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(body.slice(start, end + 1));
}

export interface StructuredResult<T> {
  data: T;
  attempts: number;
}

/**
 * Ask for JSON, validate it with zod, and on failure send the validation
 * errors back to the model so it can repair its own answer.
 */
export async function generateStructured<T>(
  provider: LLMProvider,
  schema: ZodType<T, ZodTypeDef, unknown>,
  req: CompletionRequest,
  maxAttempts = 3
): Promise<StructuredResult<T>> {
  let prompt = req.prompt;
  let lastError = "unknown error";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await provider.complete({ ...req, prompt });
    try {
      const parsed = schema.safeParse(extractJson(raw));
      if (parsed.success) return { data: parsed.data, attempts: attempt };
      lastError = parsed.error.issues
        .slice(0, 6)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    prompt = `${req.prompt}\n\nYour previous reply was invalid (${lastError}). Reply again with ONLY the corrected JSON object.`;
  }
  throw new LLMError(`Model did not return valid JSON after ${maxAttempts} attempts: ${lastError}`);
}
