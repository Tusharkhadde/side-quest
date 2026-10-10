"use client";

import { useEffect, useState } from "react";
import { Button, Card, Pill, Shell, cx } from "@/components/ui";
import { DEFAULT_SETTINGS, loadSettings, saveActive, saveSettings, type Settings } from "@/lib/client/settings";
import { clearEverything } from "@/lib/client/db";

interface Health {
  provider: string;
  model: string;
  visionModel: string;
  demo: boolean;
  reachable: boolean;
  modelInstalled?: boolean;
  visionInstalled?: boolean;
  overrideAllowed: boolean;
  elevenlabs: boolean;
}

function Segmented<T extends string | number>({ value, options, onChange, format }: { value: T; options: T[]; onChange: (v: T) => void; format?: (v: T) => string }) {
  return (
    <div className="mt-2 flex rounded-full bg-bark-100 p-1">
      {options.map((o) => (
        <button
          key={String(o)}
          onClick={() => onChange(o)}
          className={cx("flex-1 rounded-full py-2 text-sm font-semibold transition", o === value ? "bg-white text-moss-900 shadow" : "text-bark-600")}
        >
          {format ? format(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

const input = "mt-1 w-full rounded-2xl border border-bark-200 bg-white px-4 py-3 text-moss-900 outline-none focus:border-moss-500";

export default function SettingsPage() {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const [health, setHealth] = useState<Health | null>(null);
  const [saved, setSaved] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    setS(loadSettings());
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
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

  const m = s.model;

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
        <p className="font-semibold text-moss-900">Home area</p>
        <p className="text-sm text-bark-600">Used when GPS is off. Stored only on this device.</p>
        <label className="mt-3 block text-sm text-bark-700">
          Label
          <input className={input} value={s.homeArea?.label ?? ""} placeholder="Home" onChange={(e) => update({ homeArea: { lat: s.homeArea?.lat ?? 0, lon: s.homeArea?.lon ?? 0, label: e.target.value } })} />
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-sm text-bark-700">
            Latitude
            <input className={input} inputMode="decimal" value={s.homeArea?.lat ?? ""} onChange={(e) => update({ homeArea: { label: s.homeArea?.label ?? "Home", lon: s.homeArea?.lon ?? 0, lat: Number(e.target.value) } })} />
          </label>
          <label className="text-sm text-bark-700">
            Longitude
            <input className={input} inputMode="decimal" value={s.homeArea?.lon ?? ""} onChange={(e) => update({ homeArea: { label: s.homeArea?.label ?? "Home", lat: s.homeArea?.lat ?? 0, lon: Number(e.target.value) } })} />
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

      <Card className="mt-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-moss-900">Model</p>
          {health && <Pill tone={health.reachable ? "moss" : "ember"}>{health.demo ? "Demo mode" : health.reachable ? "Connected" : "Not reachable"}</Pill>}
        </div>
        {health ? (
          <div className="mt-2 space-y-1 text-sm text-bark-700">
            <p>
              Server default: <span className="font-mono">{health.provider}</span> · quests <span className="font-mono">{health.model}</span>
              {health.modelInstalled === false && <span className="text-ember-600"> (not pulled)</span>}
            </p>
            <p>
              Photo checks: <span className="font-mono">{health.visionModel}</span>
              {health.visionInstalled === false && <span className="text-ember-600"> (not pulled)</span>}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-bark-600">Checking…</p>
        )}

        {health?.overrideAllowed ? (
          <div className="mt-4 border-t border-bark-100 pt-4">
            <p className="text-sm font-semibold text-moss-900">Use a different endpoint from this device</p>
            <Segmented
              value={m?.provider ?? "server"}
              options={["server", "ollama", "openai", "mock"]}
              onChange={(v) => update({ model: v === "server" ? null : { provider: v as "ollama" | "openai" | "mock", url: m?.url, model: m?.model, visionModel: m?.visionModel, apiKey: m?.apiKey } })}
              format={(v) => ({ server: "Default", ollama: "Ollama", openai: "OpenAI-compat", mock: "Mock" })[v]}
            />
            {m && m.provider !== "mock" && (
              <div className="mt-3 space-y-2">
                <label className="block text-sm text-bark-700">
                  Base URL
                  <input className={input} placeholder={m.provider === "ollama" ? "http://localhost:11434" : "http://your-droplet:8000/v1"} value={m.url ?? ""} onChange={(e) => update({ model: { ...m, url: e.target.value || undefined } })} />
                </label>
                <label className="block text-sm text-bark-700">
                  Quest model
                  <input className={input} placeholder="gemma3n:e4b" value={m.model ?? ""} onChange={(e) => update({ model: { ...m, model: e.target.value || undefined } })} />
                </label>
                <label className="block text-sm text-bark-700">
                  Vision model
                  <input className={input} placeholder="gemma4:e4b" value={m.visionModel ?? ""} onChange={(e) => update({ model: { ...m, visionModel: e.target.value || undefined } })} />
                </label>
                {m.provider === "openai" && (
                  <label className="block text-sm text-bark-700">
                    API key (stored on this device)
                    <input className={input} type="password" value={m.apiKey ?? ""} onChange={(e) => update({ model: { ...m, apiKey: e.target.value || undefined } })} />
                  </label>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-bark-600">This server uses its configured model. Set ALLOW_MODEL_OVERRIDE=1 to choose from here.</p>
        )}
      </Card>

      <Card className="mt-4 bg-moss-50">
        <p className="font-semibold text-moss-900">What stays on this device</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-moss-800">
          <li>Your screen time, journal and photos (IndexedDB in this browser).</li>
          <li>Your exact location. Weather and park lookups get a point rounded to about 1 km.</li>
          <li>The model sees place names, weather and a small copy of your proof photo, on the model server you choose.</li>
        </ul>
        <Button variant="ghost" className="mt-4 w-full border-ember-500/40 text-ember-600" onClick={() => void wipe()}>
          Delete all my data
        </Button>
      </Card>
    </Shell>
  );
}
