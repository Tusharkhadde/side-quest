import { NextResponse } from "next/server";
import { VerifyRequestSchema } from "@/lib/api";
import { ChainError, resolveChain, timeoutFor } from "@/lib/llm";
import { stripDataUrl, verifyPhoto } from "@/lib/agent/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Photo in, verdict out. The photo (already shrunk on the phone) is passed
 * straight to the open vision model and is never written to disk or logged here.
 */
export async function POST(req: Request) {
  const parsed = VerifyRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { imageBase64, proof, questTitle, prefer } = parsed.data;
  const providers = resolveChain(process.env, { kind: "vision", prefer: prefer ?? null });
  try {
    const result = await verifyPhoto(providers, { imageBase64: stripDataUrl(imageBase64), proof, questTitle }, timeoutFor("vision"));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      {
        error: "No open vision model could check this photo right now.",
        calls: e instanceof ChainError ? e.calls : []
      },
      { status: 502 }
    );
  }
}
