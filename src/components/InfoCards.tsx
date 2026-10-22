"use client";

import { useMemo, useState } from "react";
import { useDataset } from "@/lib/client-data";
import type { DamData, MarketRow } from "@/lib/datasets";
import { normalizeTr } from "@/lib/geo";
import type { PanelId } from "@/lib/map-actions";
import { Icon, type IconName } from "./Icons";

function Card({ title, source, icon, tone, onClose, children }: { title: string; source: string; icon: IconName; tone: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-xl shadow-ink/10">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-xl" style={{ background: `${tone}14`, color: tone }}>
          <Icon name={icon} className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-ink">{title}</h3>
          <p className="truncate text-[11px] text-faint">Kaynak: {source}</p>
        </div>
        <button onClick={onClose} aria-label="Kapat" className="grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-base hover:text-ink">
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 overflow-y-auto p-4">{children}</div>
    </div>
  );
}

function DamChart({ series }: { series: DamData["series"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 340, H = 130, P = { l: 30, r: 8, t: 8, b: 20 };
  const pts = series;
  const x = (i: number) => P.l + (i / Math.max(1, pts.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - v / 100) * (H - P.t - P.b);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.percent).toFixed(1)}`).join("");
  const area = `${line}L${x(pts.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const months = pts.filter((p, i) => i === 0 || p.date.slice(5, 7) !== pts[i - 1].date.slice(5, 7));
  const h = hover !== null ? pts[hover] : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * W;
        const i = Math.round(((px - P.l) / (W - P.l - P.r)) * (pts.length - 1));
        setHover(Math.max(0, Math.min(pts.length - 1, i)));
      }}
    >
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="#e1e9e4" strokeWidth={0.6} />
          <text x={P.l - 4} y={y(v) + 3} fontSize={8} textAnchor="end" fill="#74857b" fontFamily="var(--font-geist-mono)">%{v}</text>
        </g>
      ))}
      {months.filter((_, i) => i % 2 === 0).map((m) => {
        const i = pts.indexOf(m);
        return (
          <text key={m.date} x={x(i)} y={H - 6} fontSize={8} fill="#74857b" textAnchor="middle">
            {new Date(m.date).toLocaleDateString("tr-TR", { month: "short" })}
          </text>
        );
      })}
      <path d={area} fill="#0ea5e9" opacity={0.15} />
      <path d={line} fill="none" stroke="#0284c7" strokeWidth={1.6} />
      {h && hover !== null && (
        <g>
          <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={y(0)} stroke="#4a5d52" strokeWidth={0.6} strokeDasharray="2 2" />
          <circle cx={x(hover)} cy={y(h.percent)} r={3} fill="#0284c7" stroke="#ffffff" strokeWidth={1.5} />
          <text x={Math.min(x(hover) + 4, W - 70)} y={P.t + 10} fontSize={9} fill="#12261b" fontWeight={600}>
            {new Date(h.date).toLocaleDateString("tr-TR")}: %{h.percent}
          </text>
        </g>
      )}
    </svg>
  );
}

function DamCard({ onClose }: { onClose: () => void }) {
  const { data, error } = useDataset<DamData>("baraj-doluluk");
  const cut = data ? new Date(new Date(data.current.date).getTime() - 365 * 864e5).toISOString().slice(0, 10) : "";
  const lastYear = data ? data.series.filter((s) => s.date >= cut) : [];
  const yearAgo = lastYear[0];

  return (
    <Card title="Baraj Doluluk Oranı" source="BUSKİ" icon="droplet" tone="#0284c7" onClose={onClose}>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="text-sm text-faint">Yükleniyor…</p>}
      {data && (
        <div className="space-y-3">
          <div className="flex items-end gap-4">
            <div>
              <div className="text-4xl font-semibold tracking-tight tabular-nums text-ink">%{data.current.percent.toFixed(1)}</div>
              <div className="text-xs text-faint">{new Date(data.current.date).toLocaleDateString("tr-TR", { dateStyle: "long" })} · Bursa geneli</div>
            </div>
            <div className="mb-1 text-xs text-dim">
              <div>{(data.current.remainingM3 / 1e6).toFixed(1)} milyon m³ kullanılabilir su</div>
              <div>{(data.current.capacityM3 / 1e6).toFixed(1)} milyon m³ kapasite</div>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-base">
            <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, data.current.percent)}%` }} />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-dim">Son 12 ay</p>
            <DamChart series={lastYear} />
            {yearAgo && (
              <p className="text-[11px] leading-relaxed text-faint">
                Bir yıl önce: %{yearAgo.percent} ({new Date(yearAgo.date).toLocaleDateString("tr-TR")}). %0 değerleri kullanılabilir suyun
                tükendiği ya da ölçüm girilmeyen günleri gösterebilir.
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function MarketCard({ onClose, query }: { onClose: () => void; query?: string }) {
  const { data, error } = useDataset<MarketRow[]>("hal-fiyatlari");
  const [q, setQ] = useState(query ?? "");
  const [cat, setCat] = useState<string>("Tümü");
  const cats = useMemo(() => ["Tümü", ...new Set((data ?? []).map((r) => r.kategori))], [data]);
  const rows = useMemo(() => {
    const n = normalizeTr(q);
    return (data ?? []).filter((r) => (cat === "Tümü" || r.kategori === cat) && (!n || normalizeTr(r.urun).includes(n)));
  }, [data, q, cat]);

  return (
    <Card title={`Hal Fiyatları${data?.[0] ? ` · ${data[0].tarih}` : ""}`} source="Bursa Büyükşehir Belediyesi" icon="basket" tone="#c2410c" onClose={onClose}>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="mb-3 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ürün ara…"
          className="min-w-0 flex-1 rounded-xl border border-line-strong bg-card px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-accent/60 focus:ring-4 focus:ring-accent/10"
        />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-xl border border-line-strong bg-card px-2.5 py-2 text-sm text-ink outline-none focus:border-accent/60">
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-faint">
            <th className="pb-1 font-medium">Ürün</th>
            <th className="pb-1 text-right font-medium">En düşük</th>
            <th className="pb-1 text-right font-medium">En yüksek</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="py-2 pr-2">
                <div className="text-ink">{r.urun}</div>
                <div className="text-[11px] text-faint">{r.kategori}</div>
              </td>
              <td className="py-2 text-right text-[13px] tabular-nums text-dim">{r.min.toLocaleString("tr-TR")} ₺</td>
              <td className="py-2 text-right text-[13px] font-semibold tabular-nums text-ink">
                {r.max.toLocaleString("tr-TR")} ₺<span className="text-[11px] font-normal text-faint">/{r.birim}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && !rows.length && <p className="py-4 text-center text-sm text-faint">Eşleşen ürün yok.</p>}
    </Card>
  );
}

export default function InfoCard({ panel, onClose }: { panel: { id: Exclude<PanelId, "etkinlik">; query?: string }; onClose: () => void }) {
  if (panel.id === "baraj") return <DamCard onClose={onClose} />;
  return <MarketCard key={panel.query} query={panel.query} onClose={onClose} />;
}
