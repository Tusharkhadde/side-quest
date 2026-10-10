import type { Verdict } from "../types";
import { VerdictSchema } from "../types";
import type { LLMProvider } from "../llm/types";
import { generateStructured } from "../llm/json";
import { buildVerifyPrompt, VERIFY_SYSTEM } from "./prompts";

export interface VerifyInput {
  /** Base64 JPEG, already resized on the device. No data: prefix. */
  imageBase64: string;
  proof: string;
  questTitle: string;
}

/** Ask Gemma's vision model whether the photo shows what the quest asked for. */
export async function verifyPhoto(provider: LLMProvider, input: VerifyInput): Promise<Verdict> {
  const { data } = await generateStructured(
    provider,
    VerdictSchema,
    {
      system: VERIFY_SYSTEM,
      prompt: buildVerifyPrompt(input.proof, input.questTitle),
      images: [input.imageBase64],
      temperature: 0.2
    },
    2
  );
  return data;
}

export function stripDataUrl(s: string): string {
  const i = s.indexOf("base64,");
  return i >= 0 ? s.slice(i + 7) : s;
}
