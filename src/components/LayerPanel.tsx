"use client";

import { timeAgo } from "@/lib/client-data";
import type { LayerId } from "@/lib/map-actions";

export type LayerStatus = { count?: number; error?: string; updatedAt?: Date };

const LAYERS: { id: LayerId; title: string; source: string; live?: boolean; swatch: string; legend?: { c: string; t: string }[] }[] = [
  {
    id: "depremler", title: "Depremler (30 gün)", source: "AFAD", live: true, swatch: "#dc2626",
    legend: [{ c: "#dc2626", t: "Son 24 saat" }, { c: "#f97316", t: "Son 7 gün" }, { c: "#facc15", t: "Daha eski" }],
  },
  {
    id: "hava-kalitesi", title: "Hava kalitesi (AQI)", source: "Open-Meteo", live: true, swatch: "#84cc16",
    legend: [
      { c: "#22c55e", t: "Çok iyi" }, { c: "#84cc16", t: "İyi" }, { c: "#eab308", t: "Orta" },
      { c: "#f97316", t: "Kötü" }, { c: "#ef4444", t: "Çok kötü" },
    ],
  },
  { id: "toplanma-alanlari", title: "Afet toplanma alanları", source: "Bursa BB", swatch: "#16a34a" },
  { id: "parklar", title: "Parklar ve kent ormanları", source: "Bursa BB", swatch: "#65a30d" },
  { id: "wifi-noktalari", title: "Ücretsiz Wi-Fi", source: "Bursa BB", swatch: "#2563eb" },
  { id: "ilce-sinirlari", title: "İlçe sınırları", source: "Bursa BB", swatch: "#0f766e" },
];

type Props = {
  layers: Record<LayerId, boolean>;
  status: Partial<Record<LayerId, LayerStatus>>;
  onToggle: (id: LayerId) => void;
};

export default function LayerPanel({ layers, status, onToggle }: Props) {
  return (
    <div className="h-full space-y-2 overflow-y-auto p-4">
      {LAYERS.map((l) => {
        const s = status[l.id];
        return (
          <label
            key={l.id}
            className={`block cursor-pointer rounded-xl border p-3 transition ${layers[l.id] ? "border-teal-300 bg-teal-50/50" : "border-slate-200 bg-white hover:border-slate-300"}`}
          >
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={layers[l.id]} onChange={() => onToggle(l.id)} className="h-4 w-4 accent-teal-700" />
              <span className="h-3 w-3 rounded-full" style={{ background: l.swatch }} />
              <span className="flex-1 text-sm font-medium text-slate-800">{l.title}</span>
              {l.live && (
                <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-700">
                  <span className="live-dot" /> Canlı
                </span>
              )}
            </div>
            <div className="mt-1 pl-[3.25rem] text-xs text-slate-500">
              {l.source}
              {s?.count !== undefined && ` · ${s.count} kayıt`}
              {s?.updatedAt && ` · ${timeAgo(s.updatedAt)}`}
              {s?.error && <span className="text-red-600"> · {s.error}</span>}
            </div>
            {layers[l.id] && l.legend && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 pl-[3.25rem]">
                {l.legend.map((g) => (
                  <span key={g.t} className="flex items-center gap-1 text-[11px] text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.c }} />
                    {g.t}
                  </span>
                ))}
              </div>
            )}
          </label>
        );
      })}
      <p className="px-1 pt-2 text-xs text-slate-500">
        Canlı katmanlar 5 dakikada bir kendiliğinden yenilenir. Bir öğeye tıklayarak ayrıntılarını görebilirsiniz.
      </p>
    </div>
  );
}
