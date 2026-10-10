"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadActive, loadSettings, saveActive, type ActiveQuest } from "@/lib/client/settings";
import { requestWakeLock, speak, stopSpeaking } from "@/lib/client/media";

type Phase = "ready" | "steps" | "proof";

function lineFor(a: ActiveQuest, phase: Phase, i: number): string {
  const q = a.quest;
  if (phase === "proof") return `Last thing. Take one photo of ${q.proof.replace(/\.$/, "")}. Tap when you are ready to take it.`;
  const step = `Step ${i + 1}. ${q.steps[i].text}`;
  if (i === 0) {
    const where = q.place.kind === "home" ? "" : `Head to ${q.place.name}. `;
    return `${q.title}. ${q.intro} ${where}${step} Tap anywhere when you are done.`;
  }
  return step;
}

export default function VoiceMode() {
  const router = useRouter();
  const [active, setActive] = useState<ActiveQuest | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [index, setIndex] = useState(0);
  const [showText, setShowText] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const voice = useRef<"device" | "elevenlabs">("device");
  const wake = useRef<WakeLockSentinel | null>(null);
  const warned = useRef(false);

  useEffect(() => {
    const a = loadActive();
    if (!a) {
      router.replace("/");
      return;
    }
    setActive(a);
    setIndex(Math.min(a.stepIndex, 2));
    voice.current = loadSettings().voice;
  }, [router]);

  // Countdown, kept quiet: one spoken heads-up near the end.
  useEffect(() => {
    if (!active?.startedAt) return;
    const end = new Date(active.startedAt).getTime() + active.quest.durationMinutes * 60_000;
    const tick = () => {
      const left = Math.max(0, Math.round((end - Date.now()) / 60_000));
      setRemaining(left);
      if (left <= 3 && !warned.current && phase !== "ready") {
        warned.current = true;
        void speak("A few minutes left. Start heading back when you are ready.", voice.current);
      }
    };
    tick();
    const id = window.setInterval(tick, 20_000);
    return () => window.clearInterval(id);
  }, [active, phase]);

  // Keep the screen awake (and black) while the quest runs.
  useEffect(() => {
    const reacquire = async () => {
      if (document.visibilityState === "visible" && phase !== "ready") wake.current = await requestWakeLock();
    };
    document.addEventListener("visibilitychange", reacquire);
    return () => {
      document.removeEventListener("visibilitychange", reacquire);
      void wake.current?.release().catch(() => undefined);
      stopSpeaking();
    };
  }, [phase]);

  const say = useCallback((a: ActiveQuest, p: Phase, i: number) => {
    void speak(lineFor(a, p, i), voice.current);
  }, []);

  const advance = useCallback(async () => {
    if (!active) return;
    if (phase === "ready") {
      wake.current = await requestWakeLock();
      setPhase("steps");
      say(active, "steps", index);
      return;
    }
    if (phase === "steps" && index < active.quest.steps.length - 1) {
      const next = index + 1;
      setIndex(next);
      saveActive({ ...active, stepIndex: next });
      say(active, "steps", next);
      return;
    }
    if (phase === "steps") {
      setPhase("proof");
      say(active, "proof", index);
      return;
    }
    stopSpeaking();
    router.push("/finish");
  }, [active, index, phase, router, say]);

  if (!active) return <div className="fixed inset-0 bg-night" />;

  const currentText =
    phase === "ready" ? "Tap anywhere to begin" : phase === "proof" ? active.quest.proof : active.quest.steps[index].text;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={phase === "ready" ? "Begin quest" : "Next step"}
      onClick={() => void advance()}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") void advance();
      }}
      className="fixed inset-0 z-50 flex select-none flex-col items-center justify-center bg-night text-moss-200 outline-none"
    >
      <div className="absolute top-[max(1.5rem,env(safe-area-inset-top))] text-sm tracking-[0.3em] text-white/40">
        {phase === "ready" ? "VOICE MODE" : phase === "proof" ? "PROOF" : `${index + 1} / ${active.quest.steps.length}`}
        {remaining !== null && phase !== "ready" ? ` · ${remaining} MIN` : ""}
      </div>

      <div className="animate-breathe flex h-48 w-48 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
        <span className="text-lg font-medium text-white/50">{phase === "ready" ? "Begin" : phase === "proof" ? "Camera" : "Next"}</span>
      </div>

      {(showText || phase === "ready") && <p className="mt-10 max-w-xs px-6 text-center text-lg leading-relaxed text-white/60">{currentText}</p>}

      <div className="absolute inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] flex justify-between px-6 text-sm text-white/55">
        <button
          onClick={(e) => {
            e.stopPropagation();
            stopSpeaking();
            router.push("/quest");
          }}
          className="rounded-full px-4 py-3"
        >
          Leave
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowText((v) => !v);
          }}
          className="rounded-full px-4 py-3"
        >
          {showText ? "Hide text" : "Show text"}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (phase !== "ready") say(active, phase, index);
          }}
          className="rounded-full px-4 py-3"
        >
          Repeat
        </button>
      </div>
    </div>
  );
}
