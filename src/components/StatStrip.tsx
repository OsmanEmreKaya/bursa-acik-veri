"use client";

import { aqiColor, aqiText, timeAgo, useDataset } from "@/lib/client-data";
import type { AirProps, DamData, MarketRow, QuakeProps } from "@/lib/datasets";
import type { FeatureCollection } from "@/lib/geo";
import type { MapAction } from "@/lib/map-actions";

const FIVE_MIN = 5 * 60_000;

function Tile({ label, value, sub, onClick, accent }: { label: string; value: string; sub: string; onClick: () => void; accent: string }) {
  return (
    <button
      onClick={onClick}
      className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-teal-300 hover:shadow-sm"
    >
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="truncate text-lg font-semibold leading-tight" style={{ color: accent }}>{value}</div>
      <div className="truncate text-[11px] text-slate-500">{sub}</div>
    </button>
  );
}

export default function StatStrip({ onActions }: { onActions: (a: MapAction[]) => void }) {
  const quakes = useDataset<FeatureCollection<QuakeProps>>("depremler", { refreshMs: FIVE_MIN });
  const air = useDataset<FeatureCollection<AirProps>>("hava-kalitesi", { refreshMs: FIVE_MIN });
  const dam = useDataset<DamData>("baraj-doluluk");
  const market = useDataset<MarketRow[]>("hal-fiyatlari");

  const lastQuake = quakes.data?.features[0];
  const aqis = (air.data?.features ?? []).map((f) => f.properties.aqi).filter((v): v is number => v !== null);
  const avgAqi = aqis.length ? Math.round(aqis.reduce((a, b) => a + b, 0) / aqis.length) : null;
  const temps = (air.data?.features ?? []).map((f) => f.properties.temperature).filter((v): v is number => v !== null);
  const avgTemp = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(0) : null;

  return (
    <div className="grid grid-cols-2 gap-2 px-4 pt-3">
      <Tile
        label="Son deprem"
        accent="#b91c1c"
        value={lastQuake ? `M${lastQuake.properties.mag}` : quakes.error ? "—" : "…"}
        sub={lastQuake ? `${lastQuake.properties.district || lastQuake.properties.place} · ${timeAgo(lastQuake.properties.time)}` : "AFAD"}
        onClick={() =>
          lastQuake &&
          onActions([
            { type: "showLayer", layer: "depremler" },
            { type: "highlight", layer: "depremler", ids: [Number(lastQuake.id)] },
            { type: "flyTo", center: lastQuake.geometry.coordinates as [number, number], zoom: 10 },
          ])
        }
      />
      <Tile
        label="Hava kalitesi"
        accent={aqiColor(avgAqi)}
        value={avgAqi !== null ? `${avgAqi} · ${aqiText(avgAqi)}` : air.error ? "—" : "…"}
        sub={avgTemp ? `İlçe ort. ${avgTemp}°C` : "Open-Meteo"}
        onClick={() => onActions([{ type: "showLayer", layer: "hava-kalitesi" }, { type: "flyTo", center: [29.06, 40.15], zoom: 8.6 }])}
      />
      <Tile
        label="Baraj doluluk"
        accent="#0369a1"
        value={dam.data ? `%${dam.data.current.percent.toFixed(1)}` : dam.error ? "—" : "…"}
        sub="BUSKİ · Bursa geneli"
        onClick={() => onActions([{ type: "openPanel", panel: "baraj" }])}
      />
      <Tile
        label="Hal fiyatları"
        accent="#7c2d12"
        value={market.data ? `${market.data.length} ürün` : market.error ? "—" : "…"}
        sub={market.data?.[0] ? `${market.data[0].tarih} tarihli` : "Bursa BB"}
        onClick={() => onActions([{ type: "openPanel", panel: "hal" }])}
      />
    </div>
  );
}
