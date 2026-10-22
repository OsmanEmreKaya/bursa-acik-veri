"use client";

import { AQI_LEVELS, timeAgo } from "@/lib/client-data";
import type { LayerId } from "@/lib/map-actions";
import { Icon, type IconName } from "./Icons";

export type LayerStatus = { count?: number; error?: string; updatedAt?: Date };

type LayerDef = { id: LayerId; title: string; source: string; icon: IconName; swatch: string; legend?: { c: string; t: string }[] };

const GROUPS: { title: string; live?: boolean; layers: LayerDef[] }[] = [
  {
    title: "Canlı veriler",
    live: true,
    layers: [
      {
        id: "depremler", title: "Depremler", source: "AFAD · son 30 gün", icon: "activity", swatch: "#dc2626",
        legend: [{ c: "#dc2626", t: "Son 24 saat" }, { c: "#f97316", t: "Son 7 gün" }, { c: "#facc15", t: "Daha eski" }],
      },
      {
        id: "hava-kalitesi", title: "Hava kalitesi", source: "Open-Meteo · 17 ilçe", icon: "wind", swatch: "#16a34a",
        legend: AQI_LEVELS.map((l) => ({ c: l.color, t: `${l.text} (${l.range})` })),
      },
    ],
  },
  {
    title: "Kent verileri",
    layers: [
      { id: "toplanma-alanlari", title: "Afet toplanma alanları", source: "Bursa BB", icon: "users", swatch: "#16a34a" },
      {
        id: "parklar", title: "Parklar", source: "Bursa BB · OpenStreetMap", icon: "tree", swatch: "#15803d",
        legend: [{ c: "#15803d", t: "Öne çıkan (Bursa BB)" }, { c: "#84cc16", t: "Diğer parklar (OSM)" }],
      },
      { id: "wifi-noktalari", title: "Ücretsiz Wi-Fi", source: "Bursa BB", icon: "wifi", swatch: "#2563eb" },
      { id: "ilce-sinirlari", title: "İlçe sınırları", source: "Bursa BB", icon: "map", swatch: "#00843d" },
    ],
  },
];

type Props = {
  layers: Record<LayerId, boolean>;
  status: Partial<Record<LayerId, LayerStatus>>;
  onToggle: (id: LayerId) => void;
};

function Switch({ on }: { on: boolean }) {
  return (
    <span className={`relative h-5 w-9 flex-none rounded-full transition ${on ? "bg-accent" : "bg-line-strong"}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </span>
  );
}

export default function LayerPanel({ layers, status, onToggle }: Props) {
  return (
    <div className="h-full space-y-5 overflow-y-auto px-4 py-4">
      {GROUPS.map((g) => (
        <section key={g.title}>
          <h3 className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-faint">
            {g.live && <span className="live-dot" />}
            {g.title}
            {g.live && <span className="font-normal normal-case tracking-normal">· 5 dakikada bir yenilenir</span>}
          </h3>
          <div className="overflow-hidden rounded-2xl border border-line bg-card">
            {g.layers.map((l) => {
              const s = status[l.id];
              const on = layers[l.id];
              return (
                <div key={l.id} className="border-b border-line last:border-b-0">
                  <button
                    role="switch"
                    aria-checked={on}
                    onClick={() => onToggle(l.id)}
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-card-hover"
                  >
                    <span
                      className="grid h-8 w-8 flex-none place-items-center rounded-lg transition"
                      style={on ? { background: `${l.swatch}17`, color: l.swatch } : { background: "var(--color-base)", color: "var(--color-faint)" }}
                    >
                      <Icon name={l.icon} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-medium ${on ? "text-ink" : "text-dim"}`}>{l.title}</span>
                      <span className="block truncate text-[11px] text-faint">
                        {l.source}
                        {s?.count !== undefined && ` · ${s.count.toLocaleString("tr-TR")} kayıt`}
                        {s?.updatedAt && ` · ${timeAgo(s.updatedAt)}`}
                        {s?.error && <span className="text-red-600"> · {s.error}</span>}
                      </span>
                    </span>
                    <Switch on={on} />
                  </button>
                  {on && l.legend && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 px-3.5 pb-3 pl-[3.6rem]">
                      {l.legend.map((x) => (
                        <span key={x.t} className="flex items-center gap-1.5 text-[11px] text-dim">
                          <span className="h-2 w-2 rounded-full" style={{ background: x.c }} />
                          {x.t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <p className="px-1 text-xs leading-relaxed text-faint">Haritadaki bir noktaya tıklayarak ayrıntılarını görebilirsiniz.</p>
    </div>
  );
}
