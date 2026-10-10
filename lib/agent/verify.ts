import type { ModelCall, ModelUsed, Verdict } from "../types";
import { VerdictSchema } from "../types";
import type { LLMProvider } from "../llm/types";
import { generateWithFallback } from "../llm/chain";
import { modelLabel } from "../llm/labels";
import { buildVerifyPrompt, VERIFY_SYSTEM } from "./prompts";

export interface VerifyInput {
  /** Base64 JPEG, already resized on the device. No data: prefix. */
  imageBase64: string;
  proof: string;
  questTitle: string;
}

export interface VerifyResult {
  verdict: Verdict;
  modelUsed: ModelUsed;
  calls: ModelCall[];
}

/** Ask an open vision model (Gemma by default) whether the photo shows what the quest asked for. */
export async function verifyPhoto(providers: LLMProvider[], input: VerifyInput, timeoutMs?: number): Promise<VerifyResult> {
  const res = await generateWithFallback(
    providers,
    VerdictSchema,
    {
      system: VERIFY_SYSTEM,
      prompt: buildVerifyPrompt(input.proof, input.questTitle),
      images: [input.imageBase64],
      temperature: 0.2
    },
    { maxAttempts: 2, timeoutMs }
  );
  return {
    verdict: res.data,
    calls: res.calls,
    modelUsed: { provider: res.provider.id, service: res.provider.service, host: res.provider.host, model: res.model, label: modelLabel(res.model) }
  };
}

export function stripDataUrl(s: string): string {
  const i = s.indexOf("base64,");
  return i >= 0 ? s.slice(i + 7) : s;
}
