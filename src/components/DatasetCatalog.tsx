"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/client-data";

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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Veri Setleri</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Platformdaki tüm veriler herkese açık kaynaklardan çekilir, önbelleğe alınır ve aynı biçimde sunulur. Her veri setini
            JSON veya CSV olarak indirebilir, kendi uygulamanızda API üzerinden kullanabilirsiniz.
          </p>
        </div>
        <div className="flex rounded-lg bg-slate-200/70 p-1 text-sm">
          {(["all", "live"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1 font-medium ${filter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
            >
              {f === "all" ? "Tümü" : "Canlı"}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-red-600">{error}</p>}
      {!list && !error && <p className="text-slate-500">Kaynaklar kontrol ediliyor…</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {shown.map((d) => (
          <article key={d.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold text-slate-900">{d.title}</h2>
              <div className="flex flex-none gap-1.5">
                {d.live && (
                  <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-700">
                    <span className="live-dot" /> Canlı
                  </span>
                )}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">{KIND[d.kind]}</span>
              </div>
            </div>
            <p className="mt-2 flex-1 text-sm text-slate-600">{d.description}</p>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <dt className="text-slate-500">Yayıncı</dt>
                <dd className="font-medium text-slate-800">{d.publisher}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Güncelleme</dt>
                <dd className="font-medium text-slate-800">{d.refresh}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Kayıt sayısı</dt>
                <dd className="font-medium text-slate-800">{d.count?.toLocaleString("tr-TR") ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Son çekim</dt>
                <dd className={`font-medium ${d.error ? "text-red-600" : "text-slate-800"}`}>
                  {d.error ? `Hata: ${d.error}` : d.fetchedAt ? timeAgo(d.fetchedAt) : "—"}
                </dd>
              </div>
            </dl>

            <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600">GET /api/data/{d.id}</div>

            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <a href={`/api/data/${d.id}?download`} className="rounded-lg bg-teal-700 px-3 py-1.5 font-medium text-white hover:bg-teal-800">
                JSON indir
              </a>
              <a href={`/api/data/${d.id}?format=csv`} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">
                CSV indir
              </a>
              <a href={d.sourceUrl} target="_blank" rel="noreferrer" className="ml-auto self-center text-xs text-slate-500 hover:text-teal-700 hover:underline">
                Orijinal kaynak ↗
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
