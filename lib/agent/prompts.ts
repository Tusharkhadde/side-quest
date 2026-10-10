import type { Conditions, Place, QuestContext } from "../types";
import { weatherSummary } from "../context/weather";

export const QUEST_SYSTEM = `You are Side Quest, a calm, kind outdoor guide. TASK=quest.
Someone has been staring at a screen for a long time. Turn that into one short, real-world quest that gets them outside and paying attention to the world.

Rules:
- Choose exactly ONE place from the candidates, by its "id". Prefer the one that makes the best quest, not only the closest.
- Write exactly 3 steps. Each step is ONE sentence, under 20 words, written to be spoken aloud, present tense, second person.
- Step kinds: "observe" (look closely), "collect" (find or count things; never pick living plants or take anything from protected areas), "notice" (a sense other than sight), "move" (a gentle walk or route), "listen".
- Make it specific to the place type, the weather and the time of day. Concrete beats poetic: "find three different red leaves" beats "connect with nature".
- Nothing to buy, no apps, no looking at the phone during the quest.
- "safety" is one short practical line for these exact conditions (light, heat, traffic, water edges, staying on paths).
- "proof" is ONE thing a single photo can clearly show at the end, tied to step 2 or 3.
- If conditions are not "good", the quest MUST be indoor-adjacent (balcony, terrace, doorway, stairwell window): set "indoorAdjacent": true, use the "home" candidate, and say so plainly in the intro.
- Never send anyone into water, onto roads, onto rooftops without railings, or near wild animals.

Reply with ONLY a JSON object, no markdown, with exactly these keys:
{"title": string (max 6 words), "placeId": string, "intro": string (max 2 sentences), "steps": [{"kind": "observe|collect|notice|move|listen", "text": string}, x3], "safety": string, "proof": string, "durationMinutes": number, "indoorAdjacent": boolean}`;

export const VERIFY_SYSTEM = `You are Side Quest's photo checker. TASK=verify.
You receive one photo taken at the end of an outdoor quest and the proof the quest asked for.
Be generous but honest: pass if the photo plausibly shows the requested thing, even if blurry, dim or imperfectly framed. Fail only if it clearly does not show it (for example a screen, a blank wall, or something unrelated).
Never comment on people's appearance. Write one warm, specific sentence about what you actually see.
Reply with ONLY JSON: {"pass": boolean, "comment": string (max 25 words), "confidence": number between 0 and 1}`;

const CONDITION_NOTES: Record<Conditions, string> = {
  good: "good: an outdoor quest is fine.",
  rain: "rain: rain now or likely within the hour. Indoor-adjacent quest only.",
  dark: "dark: not enough daylight left for a safe outdoor quest. Indoor-adjacent quest only.",
  "too-hot": "too-hot: dangerous heat. Indoor-adjacent quest only; suggest drinking water.",
  "too-cold": "too-cold: dangerously cold. Indoor-adjacent quest only.",
  storm: "storm: thunderstorm or strong wind. Indoor-adjacent quest only; stay away from glass in lightning."
};

export function candidateForPrompt(p: Place) {
  return { id: p.id, name: p.name, type: p.kind, walkMinutes: p.walkMinutes, distanceMeters: p.distanceMeters };
}

/** Everything the model sees. Note: no coordinates, no screen history, just a summary. */
export function buildQuestPrompt(ctx: QuestContext, candidates: Place[]): string {
  const context = {
    localTime: ctx.localTime,
    screenMinutesSoFar: ctx.screenMinutes,
    questMinutes: ctx.questMinutes,
    conditions: ctx.conditions,
    weather: weatherSummary(ctx.weather),
    candidates: candidates.map(candidateForPrompt)
  };
  return `Conditions verdict (decided by rules, do not overrule): ${CONDITION_NOTES[ctx.conditions]}
Total quest time including walking: ${ctx.questMinutes} minutes.

<context>
${JSON.stringify(context, null, 2)}
</context>

Write the quest now.`;
}

export function buildVerifyPrompt(proof: string, questTitle: string): string {
  return `Quest: "${questTitle}"
Proof requested: "${proof}"

<context>
${JSON.stringify({ proof, questTitle })}
</context>

Does the photo show it?`;
}

/** Read the <context> block back out of a prompt (used by the mock model). */
export function readContextBlock<T>(prompt: string): T | null {
  const m = prompt.match(/<context>\s*([\s\S]*?)\s*<\/context>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as T;
  } catch {
    return null;
  }
}
