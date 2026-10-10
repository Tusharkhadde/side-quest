"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Card, DisclosurePanel, ModelCredit, Shell, Spinner, Stamp, type DisclosureLine } from "@/components/ui";
import { loadActive, loadSettings, saveActive, type ActiveQuest } from "@/lib/client/settings";
import { resizeImage } from "@/lib/client/media";
import { savePhoto, updateEntry } from "@/lib/client/db";
import { resetStreak } from "@/lib/client/useStreak";
import { useHealth } from "@/lib/client/useHealth";
import type { ModelCall, ModelUsed, Verdict } from "@/lib/types";

type State =
  | { kind: "pick" }
  | { kind: "checking" }
  | { kind: "result"; verdict: Verdict; checkedBy: "model" | "self"; modelUsed?: ModelUsed }
  | { kind: "offline"; message: string };

export default function Finish() {
  const router = useRouter();
  const [active, setActive] = useState<ActiveQuest | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ blob: Blob; base64: string } | null>(null);
  const [state, setState] = useState<State>({ kind: "pick" });
  const [sent, setSent] = useState<DisclosureLine[] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const health = useHealth();
  const visionLabel = health?.vision && health.vision.id !== "demo" ? health.vision.visionLabel ?? health.vision.visionModel : null;
  const checker = visionLabel ? `${visionLabel}, an open model,` : health?.vision?.id === "demo" ? "The built-in demo checker" : "An open vision model";

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

  async function complete(verdict: Verdict, checkedBy: "model" | "self", modelUsed?: ModelUsed) {
    if (!active) return;
    const photoId = photo ? await savePhoto(photo.blob) : undefined;
    const finishedAt = new Date();
    const started = active.startedAt ? new Date(active.startedAt) : finishedAt;
    await updateEntry(active.entryId, {
      status: "completed",
      finishedAt: finishedAt.toISOString(),
      minutesOutside: Math.max(1, Math.round((finishedAt.getTime() - started.getTime()) / 60_000)),
      verdict: { ...verdict, checkedBy, ...(modelUsed ? { model: modelUsed.label } : {}) },
      ...(photoId ? { photoId } : {})
    });
    saveActive(null);
    resetStreak();
    setState({ kind: "result", verdict, checkedBy, modelUsed });
  }

  function photoDisclosure(calls: ModelCall[]): DisclosureLine[] {
    const kb = photo ? Math.max(1, Math.round(photo.blob.size / 1024)) : 0;
    const lines: DisclosureLine[] = [
      {
        to: "This app's server (/api/verify)",
        what: `A ${kb} KB copy of the photo, shrunk on this phone to 768 px, plus the proof text`,
        why: "Passed straight to the model. Never written to disk or logged."
      }
    ];
    for (const c of calls) {
      if (c.provider === "demo") {
        lines.push({ to: "Nothing further", what: "The built-in demo model looked only at the photo's size", why: "No hosted vision model is configured, or demo mode is on" });
        continue;
      }
      lines.push({
        to: `${c.host} (${c.service})`,
        what: "The same small photo and proof text",
        why:
          (c.ok ? `${c.model} checked it` : `${c.model} was tried and failed`) +
          (c.host.includes("googleapis") ? ". On Google's free tier, inputs may be used to improve Google's products." : ". DigitalOcean does not store or train on inference inputs.")
      });
    }
    return lines;
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
          prefer: loadSettings().prefer
        })
      });
      const json = (await res.json().catch(() => ({}))) as { verdict?: Verdict; error?: string; modelUsed?: ModelUsed; calls?: ModelCall[] };
      setSent(photoDisclosure(json.calls ?? []));
      if (!res.ok || !json.verdict) {
        setState({ kind: "offline", message: json.error ?? "The model could not check this photo." });
        return;
      }
      const used = json.modelUsed ? { ...json.modelUsed, label: json.modelUsed.label || json.modelUsed.model } : undefined;
      if (json.verdict.pass) await complete(json.verdict, "model", used);
      else setState({ kind: "result", verdict: json.verdict, checkedBy: "model", modelUsed: used });
    } catch {
      setState({ kind: "offline", message: "No connection to the server right now." });
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
          {state.modelUsed && (
            <div className="mt-3">
              <ModelCredit
                verb="Checked by"
                label={state.modelUsed.provider === "demo" ? "the built-in demo model" : state.modelUsed.label}
                service={state.modelUsed.provider === "demo" ? undefined : state.modelUsed.service}
                open={state.modelUsed.provider !== "demo"}
              />
            </div>
          )}
          {sent && (
            <div className="mt-6 w-full text-left">
              <DisclosurePanel items={sent} title="What left your device for the photo check" />
            </div>
          )}
          <div className="mt-8 flex w-full flex-col gap-3">
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
      <Link href="/voice" className="-ml-2 rounded-full px-2 py-2 text-sm font-medium text-bark-600">
        ← Back to the quest
      </Link>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.25em] text-moss-600">Proof</p>
      <h1 className="mt-1 font-display text-3xl leading-tight text-moss-900">{q.proof}</h1>
      <p className="mt-2 text-bark-600">
        The photo stays in your journal on this phone. {checker} looks at a small copy; the server
        does not keep it.
      </p>

      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />

      <Card className="mt-6 overflow-hidden p-0">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Your proof photo" className="aspect-[4/5] w-full object-cover" />
        ) : (
          <button onClick={() => input.current?.click()} className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 bg-moss-50 text-moss-700">
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
          <Button onClick={() => void check()}>{state.kind === "result" ? "Check again" : "Check my photo"}</Button>
        )}
        {state.kind === "checking" && (
          <Button disabled>
            <Spinner /> {visionLabel ? `${visionLabel} is looking…` : "Looking…"}
          </Button>
        )}
        {preview && (
          <Button variant="ghost" onClick={() => input.current?.click()}>
            Retake photo
          </Button>
        )}
        {sent && state.kind !== "checking" && <DisclosurePanel items={sent} title="What left your device for the photo check" />}
        {(state.kind === "offline" || state.kind === "result" || (!preview && state.kind === "pick")) && (
          <Button variant="quiet" onClick={() => void selfCheck()}>
            {preview ? "Stamp it on my honour" : "No photo today? Stamp it on my honour"}
          </Button>
        )}
      </div>
    </Shell>
  );
}
