import { NextResponse } from "next/server";
import { getProvider, isDemoMode, overrideAllowed } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which model is wired up, and can we reach it? Used by Settings. */
export async function GET() {
  const provider = getProvider();
  let reachable = provider.name === "mock";
  let installed: string[] | undefined;
  try {
    if (provider.name === "ollama") {
      const base = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
      const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2500) });
      reachable = res.ok;
      if (res.ok) {
        const json = (await res.json()) as { models?: { name: string }[] };
        installed = json.models?.map((m) => m.name);
      }
    } else if (provider.name === "openai") {
      const base = (process.env.LLM_BASE_URL || "").replace(/\/$/, "");
      const res = await fetch(`${base}/models`, {
        headers: process.env.LLM_API_KEY ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` } : {},
        signal: AbortSignal.timeout(2500)
      });
      reachable = res.ok;
    }
  } catch {
    reachable = false;
  }
  return NextResponse.json({
    provider: provider.name,
    model: provider.model,
    visionModel: provider.visionModel,
    demo: isDemoMode(),
    reachable,
    installed,
    modelInstalled: installed ? installed.some((n) => n === provider.model || n === `${provider.model}:latest`) : undefined,
    visionInstalled: installed ? installed.some((n) => n === provider.visionModel) : undefined,
    overrideAllowed: overrideAllowed(),
    elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY)
  });
}
