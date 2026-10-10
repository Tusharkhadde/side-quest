"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Pill, Shell } from "@/components/ui";
import { getPhoto, listEntries } from "@/lib/client/db";
import { useBestHours } from "@/lib/client/useBestHours";
import { computeStats } from "@/lib/stats";
import { journalToCsv } from "@/lib/csv";
import { formatHour, topHours } from "@/lib/nudge";
import type { JournalEntry } from "@/lib/types";

function Thumb({ id }: { id?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let u: string | null = null;
    getPhoto(id).then((b) => {
      if (b) {
        u = URL.createObjectURL(b);
        setUrl(u);
      }
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);
  if (!url) return <div className="h-16 w-16 shrink-0 rounded-2xl bg-moss-100" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />;
}

const STATUS_TONE = { completed: "moss", accepted: "sky", abandoned: "bark", declined: "bark", offered: "bark" } as const;

export default function Journal() {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const best = useBestHours();

  useEffect(() => {
    listEntries().then(setEntries).catch(() => setEntries([]));
  }, []);

  function exportCsv() {
    if (!entries) return;
    const blob = new Blob([journalToCsv(entries)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `side-quest-journal-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const stats = entries ? computeStats(entries) : null;
  const maxScore = best ? Math.max(...best.scores, 0.01) : 1;

  return (
    <Shell>
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-moss-600">Journal</p>
      <h1 className="mt-2 font-display text-4xl text-moss-900">Time well spent</h1>

      {entries === null && <div className="mt-6 h-40 animate-pulse rounded-4xl bg-white/50" />}

      {entries && entries.length === 0 && (
        <Card className="mt-6 text-center">
          <p className="text-4xl" aria-hidden>
            🌿
          </p>
          <p className="mt-2 font-display text-2xl text-moss-900">No quests yet</p>
          <p className="mt-1 text-bark-600">Finished quests land here with their photo stamp. Everything stays on this phone.</p>
          <div className="mt-5 flex flex-col gap-3">
            <Link href="/quest?new=1" className="inline-flex min-h-[3.25rem] items-center justify-center rounded-full bg-moss-700 px-6 text-lg font-semibold text-moss-50">
              Give me a quest
            </Link>
            <Link href="/quest?new=1&demo=1" className="inline-flex min-h-[3.25rem] items-center justify-center rounded-full border-2 border-moss-700/20 px-6 text-lg font-semibold text-moss-800">
              Try a demo quest
            </Link>
          </div>
        </Card>
      )}

      {stats && entries && entries.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3">
          {[
            { v: stats.completed, l: "quests finished" },
            { v: stats.minutesOutside, l: "minutes outside" },
            { v: stats.dayStreak, l: "day streak" },
            { v: `${Math.round(stats.acceptRate * 100)}%`, l: "nudges accepted" }
          ].map((s) => (
            <div key={s.l} className="rounded-3xl bg-white/70 p-4 ring-1 ring-bark-200/60">
              <p className="font-display text-3xl text-moss-900">{s.v}</p>
              <p className="text-sm text-bark-600">{s.l}</p>
            </div>
          ))}
        </div>
      )}

      {best && entries && entries.length > 0 && (
        <Card className="mt-6">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-moss-900">When you say yes</p>
            <Pill tone={best.source === "tabpfn" ? "sky" : "bark"}>{best.source === "tabpfn" ? "TabPFN" : "Heuristic"}</Pill>
          </div>
          <div className="mt-4 flex h-24 items-end gap-[3px]" aria-label="Chance you accept a quest, by hour">
            {best.scores.map((s, h) => (
              <div
                key={h}
                title={`${formatHour(h)}: ${Math.round(s * 100)}%`}
                className={topHours(best.scores).includes(h) ? "flex-1 rounded-t bg-moss-500" : "flex-1 rounded-t bg-moss-200"}
                style={{ height: `${Math.max(4, (s / maxScore) * 100)}%` }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-bark-500">
            <span>12am</span>
            <span>6am</span>
            <span>12pm</span>
            <span>6pm</span>
            <span>11pm</span>
          </div>
        </Card>
      )}

      <div className="mt-8 space-y-3">
        {entries
          ?.filter((e) => e.status !== "offered")
          .map((e) => (
            <Card key={e.id} className="flex gap-4 p-4">
              <Thumb id={e.photoId} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 font-semibold leading-snug text-moss-900">{e.quest.title}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Pill tone={STATUS_TONE[e.status]}>{e.status}</Pill>
                  {e.quest.demo && <Pill tone="ember">demo</Pill>}
                </div>
                <p className="mt-1 truncate text-sm text-bark-600">
                  {e.quest.place.name} · {new Date(e.offeredAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  {e.minutesOutside ? ` · ${e.minutesOutside} min` : ""}
                </p>
                {e.verdict && <p className="mt-1 line-clamp-2 text-sm text-moss-800">{e.verdict.comment}</p>}
                <p className="mt-1 text-xs text-bark-500">
                  Written by {e.quest.model}
                  {e.verdict?.model ? ` · checked by ${e.verdict.model}` : e.verdict?.checkedBy === "self" ? " · self-checked" : ""}
                </p>
              </div>
            </Card>
          ))}
      </div>

      {entries && entries.length > 0 && (
        <Button variant="ghost" className="mt-8 w-full" onClick={exportCsv}>
          Export CSV for nudge training
        </Button>
      )}
    </Shell>
  );
}
