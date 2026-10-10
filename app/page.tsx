"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Ring, Shell } from "@/components/ui";
import { useScreenMinutes } from "@/lib/client/useStreak";
import { useBestHours } from "@/lib/client/useBestHours";
import { loadActive, loadSettings, type ActiveQuest } from "@/lib/client/settings";
import { listEntries } from "@/lib/client/db";
import { computeStats, type JournalStats } from "@/lib/stats";
import { formatDuration } from "@/lib/streak";
import { formatHour, shouldNudge, topHours } from "@/lib/nudge";

function greeting(h: number) {
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Home() {
  const router = useRouter();
  const minutes = useScreenMinutes();
  const best = useBestHours();
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

  return (
    <Shell>
      <header className="mb-6">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-moss-600">Side Quest</p>
        <h1 className="mt-2 font-display text-4xl leading-tight text-moss-900">
          {hour === null ? "Hello" : greeting(hour)}.
        </h1>
      </header>

      <Ring value={minutes} max={threshold}>
        <span className="font-display text-5xl text-moss-900">{formatDuration(minutes)}</span>
        <span className="mt-1 max-w-[9rem] text-sm text-bark-600">
          {over ? "on screen without a break" : `of screen time before a nudge (${formatDuration(threshold)})`}
        </span>
      </Ring>

      <p className="mx-auto mt-4 max-w-xs text-center text-lg text-moss-800">
        {over
          ? "That is a long stretch. The world is still out there. Want a quest?"
          : "Counting only while this app is open. The desktop watcher sees the rest."}
      </p>

      {active ? (
        <Card className="mt-6">
          <p className="text-sm uppercase tracking-widest text-bark-500">Quest in progress</p>
          <p className="mt-1 font-display text-2xl text-moss-900">{active.quest.title}</p>
          <div className="mt-4 flex gap-3">
            <Button onClick={() => router.push(active.startedAt ? "/voice" : "/quest")} className="flex-1">
              Resume
            </Button>
          </div>
        </Card>
      ) : (
        <Button onClick={() => router.push("/quest?new=1")} className={over ? "mt-8 w-full bg-ember-600 hover:bg-ember-500" : "mt-8 w-full"}>
          Give me a quest
        </Button>
      )}

      {best && (
        <p className="mt-4 text-center text-sm text-bark-600">
          {goodHour ? "Now is one of your better hours to get out. " : ""}
          Best hours for you: {topHours(best.scores).map(formatHour).join(", ")}
          <span className="text-bark-400"> · {best.source === "tabpfn" ? "TabPFN" : "heuristic"}</span>
        </p>
      )}

      {stats && stats.offered > 0 && (
        <Link href="/journal" className="mt-8 grid grid-cols-3 gap-3 text-center">
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
    </Shell>
  );
}
