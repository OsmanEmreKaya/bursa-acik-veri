"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/client-data";
import { Icon, type IconName } from "./Icons";

type Entry = {
  id: string;
  title: string;
  description: string;
  publisher: string;
  sourceUrl: string;
  upstream: string;
  refresh: string;
  live: boolean;
  kind: "geojson" | "table" | "timeseries";
  count: number | null;
  fetchedAt: string | null;
  error: string | null;
};

const KIND: Record<Entry["kind"], string> = { geojson: "GeoJSON", table: "Tablo", timeseries: "Zaman serisi" };

const ICONS: Record<string, IconName> = {
  depremler: "activity",
  "hava-kalitesi": "wind",
  "baraj-doluluk": "droplet",
  "hal-fiyatlari": "basket",
  etkinlikler: "calendarDays",
  "toplanma-alanlari": "users",
  "ilce-sinirlari": "map",
  parklar: "tree",
  "wifi-noktalari": "wifi",
};

export default function DatasetCatalog() {
  const [list, setList] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "live">("all");

  useEffect(() => {
    fetch("/api/datasets")
      .then((r) => r.json())
      .then(setList)
      .catch((e: Error) => setError(e.message));
  }, []);

  const shown = (list ?? []).filter((d) => filter === "all" || d.live);

  const liveCount = (list ?? []).filter((d) => d.live).length;
  const recordCount = (list ?? []).reduce((n, d) => n + (d.count ?? 0), 0);

  return (
    <div>
      <section className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-10 px-4 py-8 sm:py-10">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
              <Icon name="database" className="h-4 w-4" />
              Açık veri kataloğu
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Veri Setleri</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-dim">
              Platformdaki tüm veriler herkese açık kaynaklardan çekilir, önbelleğe alınır ve aynı biçimde sunulur. Her veri setini
              JSON veya CSV olarak indirebilir, kendi uygulamanızda API üzerinden kullanabilirsiniz.
            </p>
            {list && (
              <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
                {[
                  [String(list.length), "veri seti"],
                  [String(liveCount), "canlı kaynak"],
                  [recordCount.toLocaleString("tr-TR"), "kayıt"],
                ].map(([v, t]) => (
                  <div key={t}>
                    <dt className="sr-only">{t}</dt>
                    <dd className="text-xl font-semibold tabular-nums tracking-tight text-ink">
                      {v} <span className="text-sm font-normal text-faint">{t}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
          <Image src="/brand/logo.webp" alt="Bursa Açık Veri" width={720} height={630} unoptimized className="hidden h-auto w-56 flex-none md:block" />
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-ink">
            {filter === "all" ? "Tüm veri setleri" : "Canlı veri setleri"}
            {list && <span className="ml-2 font-normal text-faint">{shown.length}</span>}
          </h2>
          <div className="flex rounded-xl border border-line bg-card p-1 text-sm">
            {(["all", "live"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-3 py-1 font-medium transition ${filter === f ? "bg-accent text-white shadow-sm" : "text-dim hover:text-accent"}`}
              >
                {f === "all" ? "Tümü" : "Canlı"}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-red-600">{error}</p>}
        {!list && !error && <p className="text-faint">Kaynaklar kontrol ediliyor…</p>}

        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((d) => (
            <article key={d.id} className="flex flex-col rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgb(18_38_27/0.04)] transition hover:border-accent/30 hover:shadow-md hover:shadow-ink/5">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-accent/10 text-accent">
                  <Icon name={ICONS[d.id] ?? "database"} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold leading-snug text-ink">{d.title}</h3>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {d.live && (
                      <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                        <span className="live-dot" /> Canlı
                      </span>
                    )}
                    <span className="rounded-full bg-base px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-dim">{KIND[d.kind]}</span>
                  </div>
                </div>
              </div>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-dim">{d.description}</p>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-base/60 px-3.5 py-3 text-xs">
                <div>
                  <dt className="text-faint">Yayıncı</dt>
                  <dd className="mt-0.5 font-medium text-ink">{d.publisher}</dd>
                </div>
                <div>
                  <dt className="text-faint">Güncelleme</dt>
                  <dd className="mt-0.5 font-medium text-ink">{d.refresh}</dd>
                </div>
                <div>
                  <dt className="text-faint">Kayıt sayısı</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-ink">{d.count?.toLocaleString("tr-TR") ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-faint">Son çekim</dt>
                  <dd className={`mt-0.5 font-medium ${d.error ? "text-red-600" : "text-ink"}`}>
                    {d.error ? `Hata: ${d.error}` : d.fetchedAt ? timeAgo(d.fetchedAt) : "—"}
                  </dd>
                </div>
              </dl>

              <div className="mt-3 rounded-lg border border-line px-3 py-2 font-mono text-[11px] text-dim">
                <span className="font-semibold text-accent">GET</span> /api/data/{d.id}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <a href={`/api/data/${d.id}?download`} className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 font-semibold text-accent-ink transition hover:bg-accent-strong">
                  <Icon name="download" className="h-4 w-4" />
                  JSON
                </a>
                <a href={`/api/data/${d.id}?format=csv`} className="flex items-center gap-1.5 rounded-xl border border-line-strong px-3 py-1.5 font-medium text-dim transition hover:border-accent/40 hover:text-accent">
                  <Icon name="download" className="h-4 w-4" />
                  CSV
                </a>
                <a href={d.sourceUrl} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-xs text-faint transition hover:text-accent">
                  Orijinal kaynak
                  <Icon name="external" className="h-3.5 w-3.5" />
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
