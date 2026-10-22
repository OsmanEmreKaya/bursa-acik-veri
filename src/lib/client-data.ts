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

// Avrupa Hava Kalitesi İndeksi (EAQI) seviyeleri: değer düştükçe hava temizdir.
// `color` haritadaki dolgu rengi, `ink` aynı rengin beyaz zeminde okunaklı koyu tonu.
export const AQI_LEVELS = [
  { max: 20, range: "0–20", color: "#22c55e", ink: "#15803d", text: "Çok iyi" },
  { max: 40, range: "21–40", color: "#84cc16", ink: "#4d7c0f", text: "İyi" },
  { max: 60, range: "41–60", color: "#eab308", ink: "#a16207", text: "Orta" },
  { max: 80, range: "61–80", color: "#f97316", ink: "#c2410c", text: "Kötü" },
  { max: 100, range: "81–100", color: "#ef4444", ink: "#b91c1c", text: "Çok kötü" },
  { max: Infinity, range: "100+", color: "#7e22ce", ink: "#7e22ce", text: "Son derece kötü" },
];

const aqiLevel = (aqi: number) => AQI_LEVELS.find((l) => aqi <= l.max)!;

export function aqiInk(aqi: number | null): string {
  return aqi === null ? "#74857b" : aqiLevel(aqi).ink;
}

export function aqiText(aqi: number | null): string {
  return aqi === null ? "Bilinmiyor" : aqiLevel(aqi).text;
}
