import { NextResponse } from "next/server";
import { QuestRequestSchema } from "@/lib/api";
import { getProvider } from "@/lib/llm";
import { runQuestAgent } from "@/lib/agent/quest";
import { classifyConditions } from "@/lib/context/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Context in, quest out. The device has already gathered weather and nearby
 * places; this route re-applies the safety rules and asks Gemma to write.
 * No coordinates of the user are needed here, only candidate places.
 */
export async function POST(req: Request) {
  const parsed = QuestRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }
  const body = parsed.data;
  const conditions = classifyConditions(body.weather, body.questMinutes);
  // If rules say stay close, the only valid candidate is home.
  const candidates =
    conditions === "good" ? body.candidates : body.candidates.filter((c) => c.kind === "home");
  if (!candidates.length) {
    return NextResponse.json({ error: "No candidate fits the current conditions" }, { status: 422 });
  }
  const provider = getProvider(process.env, body.override ?? null);
  const quest = await runQuestAgent({
    provider,
    ctx: {
      weather: body.weather,
      places: candidates,
      conditions,
      questMinutes: body.questMinutes,
      localTime: body.localTime,
      screenMinutes: body.screenMinutes
    }
  });
  return NextResponse.json({ quest, provider: provider.name });
}
