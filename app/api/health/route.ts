import { NextResponse } from "next/server";
import { describeChain, isDemoMode } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Which open models are wired up, in fallback order. Configuration only:
 * no keys, no network calls, so it is cheap enough for a health check.
 */
export async function GET() {
  const chain = describeChain(process.env, "text");
  const visionChain = describeChain(process.env, "vision");
  const primary = chain.find((p) => p.configured) ?? null;
  const vision = visionChain.find((p) => p.configured && p.visionModel) ?? null;
  return NextResponse.json({
    ok: true,
    demo: isDemoMode(),
    chain,
    visionChain,
    primary,
    vision,
    elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY)
  });
}
