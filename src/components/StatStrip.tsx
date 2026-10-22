"use client";

import { aqiInk, aqiText, timeAgo, useDataset } from "@/lib/client-data";
import type { AirProps, DamData, MarketRow, QuakeProps } from "@/lib/datasets";
import type { FeatureCollection } from "@/lib/geo";
import type { MapAction } from "@/lib/map-actions";
import { Icon, type IconName } from "./Icons";

const FIVE_MIN = 5 * 60_000;

type TileProps = {
  icon: IconName;
  tone: string;
  label: string;
  value: string;
  unit?: string;
  badge?: { text: string; color: string };
  sub: string;
  progress?: number;
  onClick: () => void;
};

// Renk yalnızca simgede, durum etiketinde ve çubukta kullanılır; sayılar koyu kalır ki şerit sakin görünsün.
function Tile({ icon, tone, label, value, unit, badge, sub, progress, onClick }: TileProps) {
  return (
    <button
      onClick={onClick}
      className="group flex w-[46%] min-w-0 flex-none snap-start flex-col rounded-2xl border border-line bg-card p-3 text-left md:w-auto shadow-[0_1px_2px_rgb(18_38_27/0.04)] transition hover:-translate-y-px hover:border-accent/30 hover:shadow-md hover:shadow-ink/5"
    >
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 flex-none place-items-center rounded-lg" style={{ background: `${tone}14`, color: tone }}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
        <span className="truncate text-xs font-medium text-dim">{label}</span>
      </div>
      <div className="mt-2.5 flex items-baseline gap-1.5">
        <span className="text-[22px] font-semibold leading-none tracking-tight tabular-nums text-ink">{value}</span>
        {unit && <span className="text-xs font-medium text-faint">{unit}</span>}
        {badge && (
          <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${badge.color}1f`, color: badge.color }}>
            {badge.text}
          </span>
        )}
      </div>
      {progress !== undefined && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-base">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, progress)}%`, background: tone }} />
        </div>
      )}
      <div className="mt-auto truncate pt-1.5 text-[11px] text-faint">{sub}</div>
    </button>
  );
}

export default function StatStrip({ onActions }: { onActions: (a: MapAction[]) => void }) {
  const quakes = useDataset<FeatureCollection<QuakeProps>>("depremler", { refreshMs: FIVE_MIN });
  const air = useDataset<FeatureCollection<AirProps>>("hava-kalitesi", { refreshMs: FIVE_MIN });
  const dam = useDataset<DamData>("baraj-doluluk");
  const market = useDataset<MarketRow[]>("hal-fiyatlari");

  // Kart yalnızca il sınırı içindeki son depremi gösterir; il dışındakiler sadece haritada yer alır.
  const lastQuake = quakes.data?.features.find((f) => f.properties.inBursa);
  const aqis = (air.data?.features ?? []).map((f) => f.properties.aqi).filter((v): v is number => v !== null);
  const avgAqi = aqis.length ? Math.round(aqis.reduce((a, b) => a + b, 0) / aqis.length) : null;
  const temps = (air.data?.features ?? []).map((f) => f.properties.temperature).filter((v): v is number => v !== null);
  const avgTemp = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(0) : null;
  const pending = (error?: string) => (error ? "—" : "…");

  return (
    // Telefonda kenar çubuğu kısa olduğundan kartlar yana kaydırılan tek sıra olur; geniş ekranda 2×2 ızgara.
    <div className="flex snap-x scroll-px-4 gap-2.5 overflow-x-auto px-4 pt-4 pb-1 [scrollbar-width:none] md:grid md:grid-cols-2 md:overflow-visible md:pb-0">
      <Tile
        icon="activity"
        tone="#dc2626"
        label="Son deprem"
        value={lastQuake ? `M${lastQuake.properties.mag}` : pending(quakes.error)}
        sub={lastQuake ? `${lastQuake.properties.district || lastQuake.properties.place} · ${timeAgo(lastQuake.properties.time)}` : "AFAD"}
        onClick={() =>
          lastQuake &&
          onActions([
            { type: "showLayer", layer: "depremler" },
            { type: "flyTo", center: lastQuake.geometry.coordinates as [number, number], zoom: 10 },
            { type: "focus", layer: "depremler", id: Number(lastQuake.id) },
          ])
        }
      />
      <Tile
        icon="wind"
        tone="#16a34a"
        label="Hava kalitesi"
        value={avgAqi !== null ? String(avgAqi) : pending(air.error)}
        unit={avgAqi !== null ? "AQI" : undefined}
        badge={avgAqi !== null ? { text: aqiText(avgAqi), color: aqiInk(avgAqi) } : undefined}
        sub={avgTemp ? `İlçe ortalaması · ${avgTemp}°C` : "Open-Meteo"}
        onClick={() => onActions([{ type: "showLayer", layer: "hava-kalitesi" }, { type: "flyTo", center: [29.06, 40.15], zoom: 8.6 }])}
      />
      <Tile
        icon="droplet"
        tone="#0284c7"
        label="Baraj doluluğu"
        value={dam.data ? `%${dam.data.current.percent.toFixed(1)}` : pending(dam.error)}
        progress={dam.data?.current.percent}
        sub="BUSKİ · Bursa geneli"
        onClick={() => onActions([{ type: "openPanel", panel: "baraj" }])}
      />
      <Tile
        icon="basket"
        tone="#c2410c"
        label="Hal fiyatları"
        value={market.data ? String(market.data.length) : pending(market.error)}
        unit={market.data ? "ürün" : undefined}
        sub={market.data?.[0] ? `${market.data[0].tarih} tarihli` : "Bursa BB"}
        onClick={() => onActions([{ type: "openPanel", panel: "hal" }])}
      />
    </div>
  );
}
