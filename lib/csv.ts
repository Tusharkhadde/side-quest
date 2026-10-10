import type { JournalEntry } from "./types";
import { isAccepted } from "./nudge";

export const CSV_HEADER = ["hour", "weekday", "weather_code", "temperature_c", "minutes_to_sunset", "conditions", "accepted", "completed"];

/** The journal as training data for ml/nudge_time.py. No locations, no photos. */
export function journalToCsv(entries: JournalEntry[]): string {
  const rows = entries.map((e) => {
    const w = e.weatherCode ?? -1;
    const t = e.temperatureC ?? "";
    const mins = e.minutesToSunset ?? "";
    return [
      e.hour,
      e.weekday,
      w,
      typeof t === "number" ? t.toFixed(1) : t,
      mins,
      e.quest.conditions,
      isAccepted(e.status) ? 1 : 0,
      e.status === "completed" ? 1 : 0
    ].join(",");
  });
  return [CSV_HEADER.join(","), ...rows].join("\n") + "\n";
}
