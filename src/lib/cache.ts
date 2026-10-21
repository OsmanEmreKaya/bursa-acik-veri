// Basit, süreç içi TTL önbelleği. Kaynak API'leri her istekte yormamak için
// her veri seti belirli bir süre bellekte tutulur. Son başarılı çekim zamanı ve
// hata durumu "Veri Setleri" sayfasında gösterilir.

type Entry<T> = {
  value?: T;
  fetchedAt?: number;
  expiresAt: number;
  error?: string;
  pending?: Promise<T>;
};

const store: Map<string, Entry<unknown>> =
  ((globalThis as Record<string, unknown>).__bursaCache as Map<string, Entry<unknown>>) ??
  new Map();
(globalThis as Record<string, unknown>).__bursaCache = store;

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = store.get(key) as Entry<T> | undefined;

  if (entry?.value !== undefined && entry.expiresAt > now) return entry.value;
  if (entry?.pending) return entry.pending;

  const pending = fn()
    .then((value) => {
      store.set(key, { value, fetchedAt: Date.now(), expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      // Kaynak geçici olarak çökerse elimizdeki son veriyi sunmaya devam et.
      if (entry?.value !== undefined) {
        store.set(key, { ...entry, pending: undefined, error: message, expiresAt: Date.now() + 60_000 });
        return entry.value;
      }
      store.set(key, { expiresAt: 0, error: message });
      throw err;
    });

  store.set(key, { ...(entry ?? { expiresAt: 0 }), pending });
  return pending;
}

export function cacheInfo(key: string): { fetchedAt?: number; error?: string } {
  const entry = store.get(key);
  return { fetchedAt: entry?.fetchedAt, error: entry?.error };
}

export async function fetchJson<T>(url: string, timeoutMs = 20_000): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: "application/json", "User-Agent": "bursa-acik-veri/1.0" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status} döndürdü`);
  return (await res.json()) as T;
}
