import { NextResponse } from "next/server";
import { VerifyRequestSchema } from "@/lib/api";
import { getProvider } from "@/lib/llm";
import { stripDataUrl, verifyPhoto } from "@/lib/agent/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Photo in, verdict out. The photo goes to your own model server only
 * (Ollama on this machine by default) and is not stored here.
 */
export async function POST(req: Request) {
  const parsed = VerifyRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { imageBase64, proof, questTitle, override } = parsed.data;
  const provider = getProvider(process.env, override ?? null);
  try {
    const verdict = await verifyPhoto(provider, { imageBase64: stripDataUrl(imageBase64), proof, questTitle });
    return NextResponse.json({ verdict, model: provider.visionModel });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Verification failed", model: provider.visionModel },
      { status: 502 }
    );
  }
}
