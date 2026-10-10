/** Human names for model ids. Tiny on purpose: the browser bundle imports it. */
const LABELS: Record<string, string> = {
  "gemma-4-26b-a4b-it": "Gemma 4 26B A4B",
  "gemma-4-31b-it": "Gemma 4 31B",
  "gemma-3-27b-it": "Gemma 3 27B",
  "gemma3n:e4b": "Gemma 3n E4B",
  "gemma4:e4b": "Gemma 4 E4B",
  "nemotron-nano-12b-v2-vl": "Nemotron Nano 12B v2 VL",
  "openai-gpt-oss-120b": "gpt-oss-120b",
  "openai-gpt-oss-20b": "gpt-oss-20b",
  "llama-4-maverick": "Llama 4 Maverick",
  "mistral-3-14b": "Ministral 3 14B",
  "side-quest-demo": "Side Quest demo model"
};

/** "gemma-4-26b-a4b-it" -> "Gemma 4 26B A4B". Unknown ids are shown as-is. */
export function modelLabel(model: string): string {
  if (!model) return "";
  const bare = (model.split("/").pop() ?? model).toLowerCase();
  return LABELS[bare] ?? model;
}
