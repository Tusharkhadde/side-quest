/** Tiny TTL cache that works on both server and client. */
export class TTLCache<V> {
  private store = new Map<string, { value: V; expires: number }>();
  constructor(
    private ttlMs: number,
    private max = 100
  ) {}

  get(key: string, now = Date.now()): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires < now) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V, now = Date.now()): void {
    if (this.store.size >= this.max) {
      const first = this.store.keys().next().value;
      if (first !== undefined) this.store.delete(first);
    }
    this.store.set(key, { value, expires: now + this.ttlMs });
  }
}

/** localStorage-backed cache so context survives reloads (client only). */
export function readLocal<V>(key: string, maxAgeMs: number): V | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    const { at, value } = JSON.parse(raw) as { at: number; value: V };
    if (Date.now() - at > maxAgeMs) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

export function writeLocal<V>(key: string, value: V): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    // storage full or disabled: caching is best-effort
  }
}
