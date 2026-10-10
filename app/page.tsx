"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, ModelCredit, Ring, Shell } from "@/components/ui";
import { useScreenMinutes } from "@/lib/client/useStreak";
import { useBestHours } from "@/lib/client/useBestHours";
import { primaryLabel, useHealth } from "@/lib/client/useHealth";
import { loadActive, loadSettings, type ActiveQuest } from "@/lib/client/settings";
import { listEntries } from "@/lib/client/db";
import { computeStats, type JournalStats } from "@/lib/stats";
import { formatDuration } from "@/lib/streak";
import { formatHour, shouldNudge, topHours } from "@/lib/nudge";

function greeting(h: number) {
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning.";
  if (h < 17) return "Good afternoon.";
  return "Good evening.";
}

const HOW = [
  { n: "1", t: "Reads the world, not you", d: "Weather, sunset and parks near a point rounded to ~1 km. Your exact location stays on the phone." },
  { n: "2", t: "An open model writes one quest", d: "Gemma picks the place and writes three small steps. Rain or dark? It keeps you on the balcony." },
  { n: "3", t: "The screen goes dark", d: "Steps are read aloud. One photo at the end, checked by an open vision model, stamps your journal." }
];

export default function Home() {
  const router = useRouter();
  const minutes = useScreenMinutes();
  const best = useBestHours();
  const health = useHealth();
  const model = primaryLabel(health);
  const [threshold, setThreshold] = useState(90);
  const [active, setActive] = useState<ActiveQuest | null>(null);
  const [stats, setStats] = useState<JournalStats | null>(null);
  const [hour, setHour] = useState<number | null>(null);

  useEffect(() => {
    setThreshold(loadSettings().screenThresholdMin);
    setActive(loadActive());
    setHour(new Date().getHours());
    listEntries()
      .then((e) => setStats(computeStats(e)))
      .catch(() => setStats(null));
  }, []);

  const over = minutes >= threshold;
  const goodHour = best && hour !== null ? shouldNudge(hour, best.scores) : false;
  const firstVisit = stats !== null && stats.offered === 0 && !active;

  return (
    <Shell>
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-moss-600">Side Quest</p>
        {firstVisit ? (
          <>
            <h1 className="mt-2 font-display text-[2.15rem] leading-[1.1] text-moss-900">Trade a long screen session for a 20‑minute side quest.</h1>
            <p className="mt-3 text-base leading-relaxed text-bark-700">
              An open-weight model reads the weather, the sunset and the green space near you, then writes one small, real-world quest. The screen goes dark and
              the quest is read aloud.
            </p>
          </>
        ) : (
          <h1 className="mt-2 font-display text-4xl leading-tight text-moss-900">{hour === null ? "Hello." : greeting(hour)}</h1>
        )}
      </header>

      <div className="mt-6">
        <Ring value={minutes} max={threshold} size={firstVisit ? "sm" : "md"}>
          <span className={firstVisit ? "font-display text-4xl text-moss-900" : "font-display text-5xl text-moss-900"}>{formatDuration(minutes)}</span>
          <span className="mt-1 text-xs leading-snug text-bark-600">{over ? "on screen without a break" : "on screen in a row"}</span>
          {!over && <span className="text-xs leading-snug text-bark-500">nudge at {formatDuration(threshold)}</span>}
        </Ring>
      </div>

      {over && <p className="mx-auto mt-3 max-w-xs text-center text-lg text-moss-800">That is a long stretch. The world is still out there.</p>}

      {active ? (
        <Card className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-bark-500">Quest in progress</p>
          <p className="mt-1 font-display text-2xl text-moss-900">{active.quest.title}</p>
          <Button onClick={() => router.push(active.startedAt ? "/voice" : "/quest")} className="mt-4 w-full">
            Resume
          </Button>
        </Card>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          <Button onClick={() => router.push("/quest?new=1")} className={over ? "w-full bg-ember-600 hover:bg-ember-500" : "w-full"}>
            Give me a quest
          </Button>
          <Button variant="ghost" onClick={() => router.push("/quest?new=1&demo=1")} className="w-full flex-col gap-0 py-2 leading-tight">
            <span>Try a demo quest</span>
            <span className="text-xs font-medium text-bark-500">Sample afternoon in Pune · no location needed</span>
          </Button>
        </div>
      )}

      <div className="mt-4 min-h-[1.25rem]">
        {model && !model.demoOnly && <ModelCredit verb="Quests by" label={model.label} service={model.service} />}
        {model?.demoOnly && (
          <p className="text-center text-xs text-bark-500">
            Running the built-in demo model. Set <span className="font-mono">GOOGLE_API_KEY</span> to let Gemma write the quests.
          </p>
        )}
      </div>

      {best && stats && stats.offered > 0 && (
        <p className="mt-4 text-center text-sm text-bark-600">
          {goodHour ? "Now is one of your better hours to get out. " : ""}
          Best hours for you: {topHours(best.scores).map(formatHour).join(", ")}
          <span className="text-bark-400"> · {best.source === "tabpfn" ? "TabPFN" : "heuristic"}</span>
        </p>
      )}

      {stats && stats.offered > 0 && (
        <Link href="/journal" className="mt-6 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-3xl bg-moss-100/70 p-4">
            <p className="font-display text-3xl text-moss-900">{stats.completed}</p>
            <p className="text-xs text-moss-700">quests</p>
          </div>
          <div className="rounded-3xl bg-sky-100/70 p-4">
            <p className="font-display text-3xl text-sky-700">{stats.minutesOutside}</p>
            <p className="text-xs text-sky-700">min outside</p>
          </div>
          <div className="rounded-3xl bg-bark-100 p-4">
            <p className="font-display text-3xl text-bark-700">{stats.dayStreak}</p>
            <p className="text-xs text-bark-600">day streak</p>
          </div>
        </Link>
      )}

      {firstVisit && (
        <section className="mt-8 space-y-3" aria-labelledby="how">
          <h2 id="how" className="text-xs font-semibold uppercase tracking-[0.25em] text-moss-600">
            How it works
          </h2>
          {HOW.map((s) => (
            <div key={s.n} className="flex gap-4 rounded-3xl bg-white/70 p-4 ring-1 ring-bark-200/60">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-moss-700 font-display text-lg text-white">{s.n}</span>
              <div>
                <p className="font-semibold text-moss-900">{s.t}</p>
                <p className="mt-0.5 text-sm leading-snug text-bark-700">{s.d}</p>
              </div>
            </div>
          ))}
          <p className="px-2 pt-1 text-center text-xs leading-relaxed text-bark-500">
            Exact location, photos, screen time and your journal stay on this phone. Every quest shows exactly what left your device.
          </p>
        </section>
      )}
    </Shell>
  );
}
