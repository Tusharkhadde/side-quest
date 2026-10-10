"use client";

import { useEffect, useState } from "react";

export interface ProviderStatus {
  id: string;
  service: string;
  host: string;
  model: string;
  modelLabel: string;
  visionModel: string | null;
  visionLabel: string | null;
  configured: boolean;
}

export interface Health {
  ok: boolean;
  demo: boolean;
  chain: ProviderStatus[];
  visionChain: ProviderStatus[];
  primary: ProviderStatus | null;
  vision: ProviderStatus | null;
  elevenlabs: boolean;
}

let cached: Promise<Health | null> | null = null;

/** Which open models the server has configured. Fetched once per page load. */
export function useHealth(): Health | null | undefined {
  const [health, setHealth] = useState<Health | null | undefined>(undefined);
  useEffect(() => {
    cached ??= fetch("/api/health", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Health>) : null))
      .catch(() => null);
    let alive = true;
    void cached.then((h) => alive && setHealth(h));
    return () => {
      alive = false;
    };
  }, []);
  return health;
}

/** "Gemma 4 26B A4B via Google Gemini API", or the demo model. */
export function primaryLabel(h: Health | null | undefined): { label: string; service?: string; demoOnly: boolean } | null {
  if (!h) return null;
  const p = h.primary;
  if (!p) return { label: "no model", demoOnly: true };
  return { label: p.modelLabel || p.model, service: p.id === "demo" ? undefined : p.service, demoOnly: p.id === "demo" };
}
