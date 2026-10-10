"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Card, Shell, Stamp } from "@/components/ui";
import { loadActive, loadSettings, saveActive, type ActiveQuest } from "@/lib/client/settings";
import { resizeImage } from "@/lib/client/media";
import { savePhoto, updateEntry } from "@/lib/client/db";
import { resetStreak } from "@/lib/client/useStreak";
import type { Verdict } from "@/lib/types";

type State =
  | { kind: "pick" }
  | { kind: "checking" }
  | { kind: "result"; verdict: Verdict; checkedBy: "model" | "self" }
  | { kind: "offline"; message: string };

export default function Finish() {
  const router = useRouter();
  const [active, setActive] = useState<ActiveQuest | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ blob: Blob; base64: string } | null>(null);
  const [state, setState] = useState<State>({ kind: "pick" });
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const a = loadActive();
    if (!a) router.replace("/journal");
    else setActive(a);
  }, [router]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const resized = await resizeImage(file);
    setPhoto(resized);
    setPreview(URL.createObjectURL(resized.blob));
    setState({ kind: "pick" });
  }

  async function complete(verdict: Verdict, checkedBy: "model" | "self") {
    if (!active || !photo) return;
    const photoId = await savePhoto(photo.blob);
    const finishedAt = new Date();
    const started = active.startedAt ? new Date(active.startedAt) : finishedAt;
    await updateEntry(active.entryId, {
      status: "completed",
      finishedAt: finishedAt.toISOString(),
      minutesOutside: Math.max(1, Math.round((finishedAt.getTime() - started.getTime()) / 60_000)),
      verdict: { ...verdict, checkedBy },
      photoId
    });
    saveActive(null);
    resetStreak();
    setState({ kind: "result", verdict, checkedBy });
  }

  async function check() {
    if (!active || !photo) return;
    setState({ kind: "checking" });
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: photo.base64,
          proof: active.quest.proof,
          questTitle: active.quest.title,
          override: loadSettings().model
        })
      });
      const json = (await res.json()) as { verdict?: Verdict; error?: string };
      if (!res.ok || !json.verdict) {
        setState({ kind: "offline", message: json.error ?? "The model could not check this photo." });
        return;
      }
      if (json.verdict.pass) await complete(json.verdict, "model");
      else setState({ kind: "result", verdict: json.verdict, checkedBy: "model" });
    } catch {
      setState({ kind: "offline", message: "No connection to the model right now." });
    }
  }

  async function selfCheck() {
    await complete({ pass: true, comment: "Checked on your honour. The leaves will never know." }, "self");
  }

  if (!active) return <Shell hideNav>{null}</Shell>;
  const q = active.quest;
  const today = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  if (state.kind === "result" && (state.verdict.pass || state.checkedBy === "self")) {
    return (
      <Shell>
        <div className="mt-6 flex flex-1 flex-col items-center text-center">
          <Stamp title={q.title} date={today} pass={state.checkedBy === "model"} />
          <p className="mt-6 max-w-xs text-lg text-moss-800">{state.verdict.comment}</p>
          <div className="mt-10 flex w-full flex-col gap-3">
            <Button onClick={() => router.push("/journal")}>See your journal</Button>
            <Button variant="ghost" onClick={() => router.push("/")}>
              Done
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell hideNav>
      <Link href="/voice" className="text-sm font-medium text-bark-600">
        ← Back to the quest
      </Link>
      <p className="mt-6 text-sm uppercase tracking-[0.2em] text-moss-600">Proof</p>
      <h1 className="mt-1 font-display text-3xl leading-tight text-moss-900">{q.proof}</h1>
      <p className="mt-2 text-bark-600">The photo stays on this phone. Gemma looks at a small copy and forgets it.</p>

      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />

      <Card className="mt-6 overflow-hidden p-0">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Your proof photo" className="aspect-[4/5] w-full object-cover" />
        ) : (
          <button onClick={() => input.current?.click()} className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 bg-moss-50 text-moss-700">
            <span className="text-5xl" aria-hidden>
              📷
            </span>
            <span className="text-lg font-semibold">Take the photo</span>
          </button>
        )}
      </Card>

      {state.kind === "result" && !state.verdict.pass && (
        <Card className="mt-4 bg-bark-50">
          <p className="text-moss-900">{state.verdict.comment}</p>
        </Card>
      )}
      {state.kind === "offline" && (
        <Card className="mt-4 bg-bark-50">
          <p className="text-moss-900">{state.message}</p>
          <p className="mt-1 text-sm text-bark-600">You can stamp it on your honour instead. It still counts.</p>
        </Card>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {preview && state.kind !== "checking" && (
          <Button onClick={() => void check()}>{state.kind === "result" ? "Check again" : "Check with Gemma"}</Button>
        )}
        {state.kind === "checking" && <Button disabled>Gemma is looking…</Button>}
        {preview && (
          <Button variant="ghost" onClick={() => input.current?.click()}>
            Retake photo
          </Button>
        )}
        {preview && (state.kind === "offline" || state.kind === "result") && (
          <Button variant="quiet" onClick={() => void selfCheck()}>
            Stamp it on my honour
          </Button>
        )}
      </div>
    </Shell>
  );
}
