import { NextResponse } from "next/server";
import { TtsRequestSchema } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";

/** Whether the optional ElevenLabs voice is configured on this server. */
export async function GET() {
  return NextResponse.json({ enabled: Boolean(process.env.ELEVENLABS_API_KEY) });
}

/** Optional: stream one quest step as ElevenLabs speech. Off unless a key is set. */
export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return NextResponse.json({ error: "ElevenLabs is not configured" }, { status: 404 });
  const parsed = TtsRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: parsed.data.text, model_id: "eleven_flash_v2_5" })
    }
  ).catch(() => null);
  if (!upstream || !upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "TTS failed" }, { status: 502 });
  }
  return new Response(upstream.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" }
  });
}
