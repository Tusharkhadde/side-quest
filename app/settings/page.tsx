"use client";

import { useEffect, useState } from "react";
import { Button, Card, Pill, Shell, cx } from "@/components/ui";
import { DEFAULT_SETTINGS, loadSettings, saveActive, saveSettings, type Settings } from "@/lib/client/settings";
import { clearEverything } from "@/lib/client/db";
import { useHealth, type ProviderStatus } from "@/lib/client/useHealth";
import type { ProviderId } from "@/lib/llm/types";

function Segmented<T extends string | number>({ value, options, onChange, format }: { value: T; options: T[]; onChange: (v: T) => void; format?: (v: T) => string }) {
  return (
    <div className="mt-2 flex rounded-full bg-bark-100 p-1">
      {options.map((o) => (
        <button
          key={String(o)}
          onClick={() => onChange(o)}
          aria-pressed={o === value}
          className={cx("min-h-[2.5rem] flex-1 rounded-full px-1 py-2 text-sm font-semibold transition", o === value ? "bg-white text-moss-900 shadow" : "text-bark-600")}
        >
          {format ? format(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

const input = "mt-1 w-full rounded-2xl border border-bark-200 bg-white px-4 py-3 text-moss-900 outline-none focus:border-moss-500";

const KEY_HINT: Record<string, string> = {
  "gemma-google": "Set GOOGLE_API_KEY (free from Google AI Studio) to use Gemma.",
  "do-gradient": "Set DO_MODEL_ACCESS_KEY to use open models on DigitalOcean.",
  openai: "Set LLM_BASE_URL to use your own OpenAI-compatible server.",
  ollama: "Set OLLAMA_URL to your Ollama server."
};

const SHORT: Record<string, string> = { auto: "Auto", "gemma-google": "Gemma", "do-gradient": "DO", openai: "Custom", ollama: "Ollama", demo: "Demo" };

export default function SettingsPage() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const health = useHealth();
  const [saved, setSaved] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    setS(loadSettings());
  }, []);

  function update(patch: Partial<Settings>) {
    const next = { ...s, ...patch };
    setS(next);
    saveSettings(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  }

  function useHere() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        update({ homeArea: { label: s.homeArea?.label || "Home", lat: Math.round(p.coords.latitude * 1e4) / 1e4, lon: Math.round(p.coords.longitude * 1e4) / 1e4 } });
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 10000 }
    );
  }

  async function wipe() {
    if (!window.confirm("Delete every quest, photo and setting on this device?")) return;
    await clearEverything();
    saveActive(null);
    window.localStorage.clear();
    setS(DEFAULT_SETTINGS);
  }

  const configured = health ? health.chain.filter((p) => p.configured).map((p) => p.id as ProviderId) : [];

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl text-moss-900">Settings</h1>
        {saved && <Pill>Saved</Pill>}
      </div>

      <Card className="mt-6">
        <p className="font-semibold text-moss-900">Quest length</p>
        <Segmented value={s.questMinutes} options={[10, 20, 30, 45]} onChange={(v) => update({ questMinutes: v })} format={(v) => `${v} min`} />
        <p className="mt-5 font-semibold text-moss-900">Nudge after continuous screen time</p>
        <Segmented value={s.screenThresholdMin} options={[45, 60, 90, 120]} onChange={(v) => update({ screenThresholdMin: v })} format={(v) => `${v}m`} />
        <p className="mt-5 font-semibold text-moss-900">How far to look for green space</p>
        <Segmented value={s.searchRadiusM} options={[800, 1500, 2500]} onChange={(v) => update({ searchRadiusM: v })} format={(v) => `${v / 1000} km`} />
      </Card>

      <Card className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-moss-900">Open models</p>
          {health && (
            <Pill tone={health.primary && health.primary.id !== "demo" ? "moss" : "ember"}>
              {health.demo ? "Demo mode" : health.primary && health.primary.id !== "demo" ? "Ready" : "Demo model only"}
            </Pill>
          )}
        </div>
        <p className="mt-1 text-sm text-bark-600">Tried in this order. If one fails or times out, the next one answers. Keys live on the server, never in this browser.</p>
        {health === undefined && <p className="mt-3 text-sm text-bark-600">Checking…</p>}
        {health === null && <p className="mt-3 text-sm text-ember-600">Could not reach the server.</p>}
        {health && (
          <ol className="mt-3 space-y-2">
            {health.chain.map((p: ProviderStatus, i: number) => (
              <li key={p.id} className={cx("rounded-2xl p-3 ring-1", p.configured ? "bg-white ring-bark-200/60" : "bg-bark-50 ring-bark-100")}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-moss-900">
                    {i + 1}. {p.service}
                  </p>
                  <Pill tone={p.configured ? "moss" : "bark"}>{p.configured ? "on" : "off"}</Pill>
                </div>
                {p.configured ? (
                  <p className="mt-1 text-xs text-bark-600">
                    Quests: <span className="font-medium text-moss-800">{p.modelLabel}</span>
                    {" · "}Photos: <span className="font-medium text-moss-800">{p.visionLabel ?? "not supported"}</span>
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-bark-500">{KEY_HINT[p.id] ?? "Not configured on the server."}</p>
                )}
              </li>
            ))}
          </ol>
        )}
        {health && configured.length > 1 && (
          <div className="mt-4 border-t border-bark-100 pt-4">
            <p className="text-sm font-semibold text-moss-900">Try first, from this device</p>
            <Segmented
              value={(s.prefer && configured.includes(s.prefer) ? s.prefer : "auto") as string}
              options={["auto", ...configured]}
              onChange={(v) => update({ prefer: v === "auto" ? null : (v as ProviderId) })}
              format={(v) => SHORT[v] ?? v}
            />
          </div>
        )}
        <p className="mt-4 text-xs leading-relaxed text-bark-500">
          The weights are open, so self-hosting is one env var: <span className="font-mono">LLM_PROVIDERS=ollama</span>, or an OpenAI-compatible server on your own GPU.
        </p>
      </Card>

      <Card className="mt-4">
        <p className="font-semibold text-moss-900">Home area</p>
        <p className="text-sm text-bark-600">Used when GPS is off. Stored only on this device.</p>
        <label className="mt-3 block text-sm text-bark-700">
          Label
          <input className={input} value={s.homeArea?.label ?? ""} placeholder="Home" onChange={(e) => update({ homeArea: { lat: s.homeArea?.lat ?? 0, lon: s.homeArea?.lon ?? 0, label: e.target.value } })} />
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-sm text-bark-700">
            Latitude
            <input
              className={input}
              inputMode="decimal"
              key={`lat-${s.homeArea?.lat ?? ""}`}
              defaultValue={s.homeArea?.lat || ""}
              placeholder="18.52"
              onBlur={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && Math.abs(v) <= 90) update({ homeArea: { label: s.homeArea?.label ?? "Home", lon: s.homeArea?.lon ?? 0, lat: v } });
              }}
            />
          </label>
          <label className="text-sm text-bark-700">
            Longitude
            <input
              className={input}
              inputMode="decimal"
              key={`lon-${s.homeArea?.lon ?? ""}`}
              defaultValue={s.homeArea?.lon || ""}
              placeholder="73.86"
              onBlur={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && Math.abs(v) <= 180) update({ homeArea: { label: s.homeArea?.label ?? "Home", lat: s.homeArea?.lat ?? 0, lon: v } });
              }}
            />
          </label>
        </div>
        <Button variant="ghost" className="mt-3 w-full" onClick={useHere} disabled={locating}>
          {locating ? "Locating…" : "Use where I am now"}
        </Button>
      </Card>

      <Card className="mt-4">
        <p className="font-semibold text-moss-900">Voice</p>
        <Segmented
          value={s.voice}
          options={["device", "elevenlabs"] as Settings["voice"][]}
          onChange={(v) => update({ voice: v })}
          format={(v) => (v === "device" ? "On-device (free)" : "ElevenLabs")}
        />
        {s.voice === "elevenlabs" && health && !health.elevenlabs && (
          <p className="mt-2 text-sm text-ember-600">ELEVENLABS_API_KEY is not set on the server, so the on-device voice will be used.</p>
        )}
      </Card>

      <Card className="mt-4 bg-moss-50">
        <p className="font-semibold text-moss-900">What stays on this device</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-moss-800">
          <li>Your screen-time history, journal and photos (IndexedDB in this browser). The server only ever hears &quot;N minutes on screen&quot;.</li>
          <li>Your exact location. Weather and park lookups get a point rounded to about 1 km; distances to parks are rounded to 250 m.</li>
          <li>The model sees place names, a weather summary and, if you ask for a check, a 768 px copy of your proof photo. The server stores none of it.</li>
          <li>Each quest has a &quot;What left your device&quot; panel listing every request it made.</li>
        </ul>
        <Button variant="ghost" className="mt-4 w-full border-ember-500/40 text-ember-600" onClick={() => void wipe()}>
          Delete all my data
        </Button>
      </Card>
    </Shell>
  );
}
