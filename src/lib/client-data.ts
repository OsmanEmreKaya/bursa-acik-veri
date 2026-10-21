"use client";

import { useEffect, useState } from "react";
import type { DatasetId } from "./datasets";

// İstemci tarafı küçük önbellek: aynı veri setini birden çok bileşen istediğinde
// tek istek atılır. Canlı veri setleri `refreshMs` aralıklarla yenilenir.
const memo = new Map<DatasetId, { at: number; promise: Promise<unknown> }>();

export function fetchDataset<T>(id: DatasetId, maxAgeMs = 60_000): Promise<T> {
  const hit = memo.get(id);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.promise as Promise<T>;
  const promise = fetch(`/api/data/${id}`).then(async (r) => {
    const body = await r.json();
    if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
    return body;
  });
  memo.set(id, { at: Date.now(), promise });
  promise.catch(() => memo.delete(id));
  return promise as Promise<T>;
}

export function useDataset<T>(id: DatasetId, opts: { enabled?: boolean; refreshMs?: number } = {}) {
  const { enabled = true, refreshMs } = opts;
  const [state, setState] = useState<{ data?: T; error?: string; updatedAt?: Date }>({});

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = (maxAge?: number) =>
      fetchDataset<T>(id, maxAge)
        .then((data) => alive && setState({ data, updatedAt: new Date() }))
        .catch((e: Error) => alive && setState((s) => ({ ...s, error: e.message })));
    load();
    const timer = refreshMs ? setInterval(() => load(refreshMs - 1000), refreshMs) : undefined;
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [id, enabled, refreshMs]);

  return state;
}

export function timeAgo(iso: string | Date): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.round(h / 24)} gün önce`;
}

export const trDateTime = (iso: string) =>
  new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short" });

export function aqiColor(aqi: number | null): string {
  if (aqi === null) return "#9ca3af";
  if (aqi <= 20) return "#22c55e";
  if (aqi <= 40) return "#84cc16";
  if (aqi <= 60) return "#eab308";
  if (aqi <= 80) return "#f97316";
  if (aqi <= 100) return "#ef4444";
  return "#7e22ce";
}

export function aqiText(aqi: number | null): string {
  if (aqi === null) return "Bilinmiyor";
  if (aqi <= 20) return "Çok iyi";
  if (aqi <= 40) return "İyi";
  if (aqi <= 60) return "Orta";
  if (aqi <= 80) return "Kötü";
  if (aqi <= 100) return "Çok kötü";
  return "Son derece kötü";
}
