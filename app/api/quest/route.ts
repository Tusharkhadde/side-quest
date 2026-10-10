import { NextResponse } from "next/server";
import { QuestRequestSchema } from "@/lib/api";
import { resolveChain, timeoutFor } from "@/lib/llm";
import { runQuestAgent } from "@/lib/agent/quest";
import { classifyConditions } from "@/lib/context/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Context in, quest out. The device has already gathered weather and nearby
 * places; this route re-applies the safety rules and asks the open-model
 * chain (Gemma first) to write. It never receives the user's coordinates:
 * only candidate places, rounded distances, a weather summary and a minute count.
 * Nothing is stored.
 */
export async function POST(req: Request) {
  const parsed = QuestRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }
  const body = parsed.data;
  const conditions = classifyConditions(body.weather, body.questMinutes);
  // If rules say stay close, the only valid candidate is home.
  const candidates = conditions === "good" ? body.candidates : body.candidates.filter((c) => c.kind === "home");
  if (!candidates.length) {
    return NextResponse.json({ error: "No candidate fits the current conditions" }, { status: 422 });
  }
  const providers = resolveChain(process.env, { kind: "text", prefer: body.prefer ?? null });
  const quest = await runQuestAgent({
    providers,
    timeoutMs: timeoutFor("text"),
    ctx: {
      weather: body.weather,
      places: candidates,
      conditions,
      questMinutes: body.questMinutes,
      localTime: body.localTime,
      screenMinutes: body.screenMinutes
    }
  });
  return NextResponse.json({ quest: { ...quest, demo: Boolean(body.demo) } }, { headers: { "Cache-Control": "no-store" } });
}
