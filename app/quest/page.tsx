"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, DisclosurePanel, ModelCredit, Pill, Shell } from "@/components/ui";
import { lastLocation, loadActive, loadSettings, saveActive, type ActiveQuest } from "@/lib/client/settings";
import { LocationError, requestQuest } from "@/lib/client/questFlow";
import { updateEntry } from "@/lib/client/db";
import { currentScreenMinutes } from "@/lib/client/useStreak";
import { directionsLink, mapLink } from "@/lib/geo";
import { conditionsLabel } from "@/lib/context/weather";
import { DEMO_ATTRIBUTION, DEMO_CITY, DEMO_ORIGIN } from "@/lib/demo/sample";
import type { QuestStep } from "@/lib/types";

const STEP_ICON: Record<QuestStep["kind"], string> = {
  observe: "👁",
  collect: "✋",
  notice: "✦",
  move: "➜",
  listen: "♪"
};

const STAYED = ["exact location", "screen-time history", "journal", "photos"];

function QuestInner() {
  const router = useRouter();
  const params = useSearchParams();
  const demoParam = params.get("demo") === "1";
  const [active, setActive] = useState<ActiveQuest | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; location: boolean } | null>(null);
  const started = useRef(false);

  const generate = useCallback(
    async (demo: boolean) => {
      setError(null);
      setStage("Getting ready");
      try {
        const fromWatcher = Number(params.get("screen"));
        const minutes = Number.isFinite(fromWatcher) && fromWatcher > 0 ? fromWatcher : currentScreenMinutes();
        const { quest, entry } = await requestQuest(loadSettings(), minutes, { demo, onStage: setStage });
        const next: ActiveQuest = { quest, entryId: entry.id, stepIndex: 0 };
        saveActive(next);
        setActive(next);
      } catch (e) {
        setError({
          message: e instanceof Error ? e.message : "Something went wrong.",
          location: e instanceof LocationError
        });
      } finally {
        setStage(null);
      }
    },
    [params]
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Never overwrite a quest that is already in progress.
    const existing = loadActive();
    if (existing) setActive(existing);
    else void generate(demoParam);
  }, [generate, demoParam]);

  async function decline(goHome: boolean) {
    const wasDemo = Boolean(active?.quest.demo);
    if (active) await updateEntry(active.entryId, { status: "declined" });
    saveActive(null);
    setActive(null);
    if (goHome) router.push("/");
    else void generate(wasDemo);
  }

  async function goDark() {
    if (!active) return;
    const startedAt = new Date().toISOString();
    await updateEntry(active.entryId, { status: "accepted", startedAt });
    saveActive({ ...active, startedAt, stepIndex: 0 });
    router.push("/voice");
  }

  if (stage) {
    return (
      <Shell hideNav>
        <div className="flex flex-1 flex-col items-center justify-center text-center" role="status" aria-live="polite">
          <div className="animate-breathe h-24 w-24 rounded-full bg-moss-300" />
          <p className="mt-8 font-display text-2xl text-moss-900">{stage}…</p>
          <p className="mt-2 max-w-xs text-sm text-bark-600">
            {demoParam
              ? `Demo: a sample afternoon in ${DEMO_CITY}. Your location is not read.`
              : "Your exact location stays on this device. Only a point rounded to ~1 km is used for weather and parks."}
          </p>
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <Card className="mt-10">
          <p className="text-3xl" aria-hidden>
            🧭
          </p>
          <p className="mt-2 font-display text-2xl text-moss-900">No quest yet</p>
          <p className="mt-2 text-bark-700">{error.message}</p>
          <div className="mt-6 flex flex-col gap-3">
            <Button onClick={() => void generate(demoParam)}>Try again</Button>
            {!demoParam && (
              <Button variant="ghost" onClick={() => void generate(true)}>
                Try a demo quest instead
              </Button>
            )}
            {error.location && (
              <Link href="/settings" className="py-2 text-center font-semibold text-moss-700 underline underline-offset-4">
                Set a home area
              </Link>
            )}
          </div>
        </Card>
      </Shell>
    );
  }

  if (!active) {
    return (
      <Shell hideNav>
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-breathe h-24 w-24 rounded-full bg-moss-200" />
        </div>
      </Shell>
    );
  }

  const q = active.quest;
  const origin = q.demo ? DEMO_ORIGIN : lastLocation();
  const isHome = q.place.kind === "home";
  const placeHref = isHome ? null : origin ? directionsLink(origin, q.place) : mapLink(q.place);

  return (
    <Shell hideNav>
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="-ml-2 rounded-full px-2 py-2 text-sm font-medium text-bark-600">
          ← Back
        </Link>
        <div className="flex flex-wrap justify-end gap-2">
          {q.demo && <Pill tone="ember">Demo · {DEMO_CITY}</Pill>}
          <Pill tone={q.indoorAdjacent ? "sky" : "moss"}>{q.indoorAdjacent ? "Indoor-adjacent" : conditionsLabel(q.conditions)}</Pill>
        </div>
      </div>

      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.25em] text-moss-600">Your side quest</p>
      <h1 className="mt-1 font-display text-[2.1rem] leading-tight text-moss-900">{q.title}</h1>
      <p className="mt-3 text-lg leading-snug text-moss-800">{q.intro}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Pill tone="bark">⏱ {q.durationMinutes} min</Pill>
        {!isHome && <Pill tone="moss">🚶 {q.place.walkMinutes} min walk</Pill>}
        <Pill tone="sky">{q.weatherSummary}</Pill>
      </div>

      <Card className="mt-5 p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-bark-500">Where</p>
        <p className="mt-1 text-xl font-semibold text-moss-900">{q.place.name}</p>
        {placeHref && (
          <a href={placeHref} target="_blank" rel="noreferrer" className="mt-1 inline-block py-1 text-sm font-medium text-sky-700 underline underline-offset-4">
            Walking directions (OpenStreetMap)
          </a>
        )}
        <ol className="mt-5 space-y-4">
          {q.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-moss-100 text-moss-700" aria-hidden>
                {STEP_ICON[s.kind]}
              </span>
              <p className="pt-1 text-[1.05rem] leading-snug text-moss-900">{s.text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-5 space-y-2 border-t border-bark-100 pt-4 text-sm">
          <p className="text-bark-700">
            <span className="font-semibold">Stay safe:</span> {q.safety}
          </p>
          <p className="text-bark-700">
            <span className="font-semibold">Proof photo:</span> {q.proof}
          </p>
        </div>
      </Card>

      {q.source === "fallback" && (
        <p className="mt-3 rounded-2xl bg-bark-100 px-4 py-3 text-center text-sm text-bark-700">
          No open model answered in time, so this is one of Side Quest&apos;s hand-written quests.
        </p>
      )}

      <Button onClick={() => void goDark()} className="mt-6 w-full bg-night text-white hover:bg-black">
        Go dark and start
      </Button>
      <p className="mt-2 text-center text-xs text-bark-500">The screen turns black and the quest continues by voice.</p>
      <div className="mt-2 flex justify-center gap-4">
        <Button variant="quiet" className="min-h-[2.75rem] px-3 text-base" onClick={() => void decline(false)}>
          Another one
        </Button>
        <Button variant="quiet" className="min-h-[2.75rem] px-3 text-base" onClick={() => void decline(true)}>
          Not now
        </Button>
      </div>

      <div className="mt-5 space-y-3">
        {q.modelUsed && q.modelUsed.provider !== "demo" ? (
          <ModelCredit verb="Quest written by" label={q.modelUsed.label} service={q.modelUsed.service} />
        ) : q.modelUsed ? (
          <ModelCredit verb="Quest written by" label="the built-in demo model" open={false} />
        ) : null}
        {q.disclosure && q.disclosure.length > 0 && <DisclosurePanel items={q.disclosure} stayed={STAYED} />}
        {q.demo && <p className="text-center text-[11px] text-bark-400">Demo places: {DEMO_ATTRIBUTION.split(". http")[0]}</p>}
      </div>
    </Shell>
  );
}

export default function QuestPage() {
  return (
    <Suspense fallback={null}>
      <QuestInner />
    </Suspense>
  );
}
