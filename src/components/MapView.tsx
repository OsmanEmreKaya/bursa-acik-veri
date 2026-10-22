"use client";

import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent, Marker as MlMarker, Popup as MlPopup } from "maplibre-gl";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { AQI_LEVELS, aqiText, fetchDataset, timeAgo, trDateTime } from "@/lib/client-data";
import type { FeatureCollection } from "@/lib/geo";
import type { LayerId } from "@/lib/map-actions";
import { Icon } from "./Icons";

export type MapHandle = {
  flyTo: (center: [number, number], zoom: number) => void;
  fitBounds: (b: [number, number, number, number]) => void;
  setMarker: (center: [number, number] | null, label?: string) => void;
  getCenter: () => [number, number] | undefined;
  // Öğenin bilgi kutusunu açar ve kutu açık kaldığı sürece vurgular.
  focus: (layer: LayerId, id: number) => void;
};

type Props = {
  ref?: Ref<MapHandle>;
  layers: Record<LayerId, boolean>;
  highlights: Partial<Record<LayerId, number[]>>;
  onLayerStatus?: (id: LayerId, status: { count?: number; error?: string; updatedAt?: Date }) => void;
  // Haritanın üstünde bir bilgi kartı açıkken lejant kartın arkasından taşmasın diye gizlenir.
  hideLegend?: boolean;
};

// CARTO'nun CDN'i OpenFreeMap'e göre belirgin biçimde hızlı (karo başına ~0,1 sn'ye karşı 2-20 sn).
const STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
// Altlığın gri zeminini sitenin hafif yeşil tonlu zeminine yaklaştırır.
const BASEMAP_BG = "#f2f6f3";
const LIVE_REFRESH_MS = 5 * 60_000;
const LIVE_LAYERS: LayerId[] = ["depremler", "hava-kalitesi"];

// Her veri katmanının haritadaki alt katmanları (görünürlük birlikte yönetilir).
const SUBLAYERS: Record<LayerId, string[]> = {
  "ilce-sinirlari": ["ilce-fill", "ilce-line"],
  "toplanma-alanlari": ["toplanma-fill", "toplanma-line", "toplanma-dot"],
  parklar: ["park-circle"],
  "wifi-noktalari": ["wifi-circle"],
  "hava-kalitesi": ["aqi-circle", "aqi-label"],
  depremler: ["quake-circle"],
};

// Gizliyken Next.js'in önbelleğinden düşen sayfaların haritaları efekt temizliğine uğramaz;
// yeni harita kurulurken DOM'dan kopmuş olanları burada kapatıyoruz.
const liveMaps = new Set<MlMap>();

// İki tür vurgu var: `hl` asistanın işaret ettikleri (yeni yanıtla sıfırlanır), `focus` bilgi kutusu açık olan öğe
// (kutu kapanınca kalkar). Görünüşleri aynı.
const hl = (on: unknown, off: unknown) => [
  "case",
  ["any", ["boolean", ["feature-state", "hl"], false], ["boolean", ["feature-state", "focus"], false]],
  on,
  off,
];

function addLayers(map: MlMap) {
  const empty = { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection;
  for (const id of Object.keys(SUBLAYERS)) map.addSource(id, { type: "geojson", data: empty });
  map.addSource("toplanma-merkez", { type: "geojson", data: empty });

  map.addLayer({
    id: "ilce-fill", type: "fill", source: "ilce-sinirlari",
    paint: { "fill-color": "#00843d", "fill-opacity": hl(0.1, 0) as never },
  });
  map.addLayer({
    id: "ilce-line", type: "line", source: "ilce-sinirlari",
    paint: { "line-color": "#00843d", "line-width": hl(2.5, 1.1) as never, "line-opacity": hl(0.95, 0.55) as never },
  });

  map.addLayer({
    id: "toplanma-fill", type: "fill", source: "toplanma-alanlari", minzoom: 12,
    paint: { "fill-color": hl("#15803d", "#22c55e") as never, "fill-opacity": hl(0.55, 0.3) as never },
  });
  map.addLayer({
    id: "toplanma-line", type: "line", source: "toplanma-alanlari", minzoom: 12,
    paint: { "line-color": "#15803d", "line-width": hl(2.5, 1) as never },
  });
  map.addLayer({
    id: "toplanma-dot", type: "circle", source: "toplanma-merkez", maxzoom: 12,
    paint: {
      "circle-radius": hl(7, 3) as never,
      "circle-color": "#16a34a",
      "circle-stroke-color": hl("#12261b", "#ffffff") as never,
      "circle-stroke-width": hl(2, 0.5) as never,
    },
  });

  map.addLayer({
    id: "park-circle", type: "circle", source: "parklar",
    // Belediyenin öne çıkan parkları büyük ve koyu yeşil, OpenStreetMap'teki diğer parklar küçük ve açık yeşil;
    // üst üste geldiklerinde öne çıkanlar üstte kalır.
    layout: { "circle-sort-key": ["case", ["get", "onecikan"], 1, 0] },
    paint: {
      "circle-radius": ["case", ["get", "onecikan"], hl(10, 7), hl(7, 4)] as never,
      "circle-color": ["case", ["get", "onecikan"], "#15803d", "#84cc16"],
      "circle-stroke-color": hl("#12261b", "#ffffff") as never,
      "circle-stroke-width": ["case", ["get", "onecikan"], hl(2.5, 2), hl(2, 1)] as never,
    },
  });
  map.addLayer({
    id: "wifi-circle", type: "circle", source: "wifi-noktalari",
    paint: {
      "circle-radius": hl(9, 5) as never,
      "circle-color": "#2563eb",
      "circle-stroke-color": hl("#12261b", "#ffffff") as never,
      "circle-stroke-width": hl(2.5, 1.5) as never,
    },
  });

  map.addLayer({
    id: "aqi-circle", type: "circle", source: "hava-kalitesi",
    paint: {
      "circle-radius": hl(20, 15) as never,
      "circle-color": [
        "step", ["coalesce", ["get", "aqi"], -1],
        "#9ca3af", 0, "#22c55e", 20.5, "#84cc16", 40.5, "#eab308", 60.5, "#f97316", 80.5, "#ef4444", 100.5, "#7e22ce",
      ],
      "circle-opacity": 0.9,
      "circle-stroke-color": hl("#12261b", "#ffffff") as never,
      "circle-stroke-width": hl(3, 2) as never,
    },
  });
  map.addLayer({
    id: "aqi-label", type: "symbol", source: "hava-kalitesi",
    layout: {
      "text-field": ["to-string", ["coalesce", ["get", "aqi"], "–"]],
      "text-font": ["Open Sans Bold"],
      "text-size": 12,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#12261b" },
  });

  map.addLayer({
    id: "quake-circle", type: "circle", source: "depremler",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["get", "mag"], 0, 4, 2, 7, 3, 11, 4, 16, 5, 24, 6, 34],
      "circle-color": [
        "step", ["get", "ageHours"], "#dc2626", 24, "#f97316", 168, "#facc15",
      ],
      "circle-opacity": hl(0.95, 0.75) as never,
      "circle-stroke-color": hl("#12261b", "#ffffff") as never,
      "circle-stroke-width": hl(3, 1) as never,
    },
  });
}

function popupHtml(layer: LayerId, p: Record<string, unknown>): string {
  const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const row = (k: string, v: unknown) => (v === null || v === undefined || v === "" ? "" : `<div class="row"><span>${k}</span><b>${esc(v)}</b></div>`);
  switch (layer) {
    case "depremler":
      return `<h4>Deprem · M${esc(p.mag)}</h4><p class="muted">${esc(p.place)}</p>${p.inBursa ? "" : row("Konum", `Bursa dışında · ~${p.distanceKm} km`)}${row("Zaman", trDateTime(String(p.time)))}${row("Ne zaman", timeAgo(String(p.time)))}${row("Derinlik", `${p.depth} km`)}${row("Kaynak", "AFAD")}`;
    case "hava-kalitesi":
      return `<h4>${esc(p.ilce)} · ${aqiText(p.aqi as number | null)}</h4>${row("Avrupa AQI", p.aqi)}${row("PM2.5", p.pm2_5 != null ? `${p.pm2_5} µg/m³` : null)}${row("PM10", p.pm10 != null ? `${p.pm10} µg/m³` : null)}${row("NO₂", p.no2 != null ? `${p.no2} µg/m³` : null)}${row("Sıcaklık", p.temperature != null ? `${p.temperature} °C` : null)}${row("Nem", p.humidity != null ? `%${p.humidity}` : null)}${row("Rüzgar", p.wind != null ? `${p.wind} km/sa` : null)}`;
    case "toplanma-alanlari":
      return `<h4>${esc(p.ad)}</h4>${row("Mahalle", p.mahalle)}${row("İlçe", p.ilce)}<p class="muted">Afet toplanma alanı</p>`;
    case "parklar":
      return p.onecikan
        ? `<h4>${esc(p.ad)}</h4><p>${esc(String(p.ozet ?? "").slice(0, 180))}</p>${row("Adres", p.adres)}${row("İlçe", p.ilce)}${row("Kaynak", "Bursa BB · öne çıkan park")}`
        : `<h4>${esc(p.ad)}</h4>${row("İlçe", p.ilce)}${row("Kaynak", "OpenStreetMap")}`;
    case "wifi-noktalari":
      return `<h4>${esc(p.ad)}</h4><p class="muted">Ücretsiz belediye Wi-Fi noktası</p>`;
    case "ilce-sinirlari":
      return `<h4>${esc(p.ad)}</h4>`;
  }
}

export default function MapView({ ref, layers, highlights, onLayerStatus, hideLegend }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerRef = useRef<MlMarker | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const loaded = useRef<Set<LayerId>>(new Set());
  const appliedHl = useRef<Partial<Record<LayerId, number[]>>>({});
  const popupRef = useRef<MlPopup | null>(null);
  const focused = useRef<{ layer: LayerId; id: number } | null>(null);
  const dataRef = useRef<Partial<Record<LayerId, GeoJSON.FeatureCollection>>>({});

  function setFocus(map: MlMap, next: { layer: LayerId; id: number } | null) {
    if (focused.current) setFlag(map, focused.current.layer, focused.current.id, "focus", false);
    focused.current = next;
    if (next) setFlag(map, next.layer, next.id, "focus", true);
  }
  const [ready, setReady] = useState(false);
  const statusCb = useRef(onLayerStatus);
  useEffect(() => {
    statusCb.current = onLayerStatus;
  }, [onLayerStatus]);

  useImperativeHandle(ref, () => ({
    flyTo: (center, zoom) => mapRef.current?.flyTo({ center, zoom, duration: 1200 }),
    fitBounds: (b) => mapRef.current?.fitBounds(b, { padding: 60, maxZoom: 15, duration: 1200 }),
    setMarker: (center, label) => {
      markerRef.current?.remove();
      markerRef.current = null;
      const lib = libRef.current;
      if (!center || !lib || !mapRef.current) return;
      markerRef.current = new lib.Marker({ color: "#00843d" })
        .setLngLat(center)
        .setPopup(new lib.Popup({ offset: 24 }).setText(label ?? ""))
        .addTo(mapRef.current);
    },
    getCenter: () => {
      const c = mapRef.current?.getCenter();
      return c ? [c.lng, c.lat] : undefined;
    },
    focus: (layer, id) => {
      const map = mapRef.current;
      const popup = popupRef.current;
      const f = dataRef.current[layer]?.features.find((x) => x.id === id);
      if (!map || !popup || !f) return;
      const at = f.geometry.type === "Point" ? (f.geometry.coordinates as [number, number]) : (f.properties as { merkez: [number, number] }).merkez;
      popup.setLngLat(at).setHTML(popupHtml(layer, f.properties as Record<string, unknown>)).addTo(map);
      setFocus(map, { layer, id });
    },
  }));

  // Haritayı bir kez oluştur.
  useEffect(() => {
    const el = container.current;
    let cancelled = false;
    // Sayfaya geri dönüldü: harita gizliyken yaşamaya devam etti, yeniden kurmaya gerek yok.
    if (mapRef.current) {
      mapRef.current.resize();
      return;
    }
    (async () => {
      const lib = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      lib.setWorkerUrl("/maplibre-gl-worker.mjs");
      libRef.current = lib;
      const map = new lib.Map({
        container: container.current,
        style: STYLE,
        // Bursa il sınırlarını kapsayan başlangıç görünümü
        bounds: [27.95, 39.55, 30.05, 40.65],
        fitBoundsOptions: { padding: 20 },
        attributionControl: false,
      });
      map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
      // Kaynak bilgisi sağ altta, asistan maskotunun altında durur; açılınca sola doğru genişler.
      // Sol altta ölçek ve onun üstünde lejant yer alır.
      map.addControl(new lib.AttributionControl({ compact: true }), "bottom-right");
      map.addControl(new lib.ScaleControl({ unit: "metric" }), "bottom-left");
      mapRef.current = map;
      for (const m of liveMaps) {
        if (!m.getContainer().isConnected) {
          m.remove();
          liveMaps.delete(m);
        }
      }
      liveMaps.add(map);

      // "load" altlık karolarının tamamı inene kadar beklediği için veri katmanlarını stil
      // hazır olur olmaz ekliyoruz; karo sunucusu yavaşsa bile veriler hemen görünür.
      map.once("style.load", () => {
        const bg = map.getStyle().layers.find((l) => l.type === "background");
        if (bg) map.setPaintProperty(bg.id, "background-color", BASEMAP_BG);
        addLayers(map);
        // MapLibre'nin closeOnClick seçeneği, kutu açıkken başka bir öğeye tıklanınca yeni açılan kutuyu aynı tıklamada
        // kapatıyor (olay dinleyicileri kopyalanarak çağrılıyor). Kapanmayı aşağıda kendimiz yönetiyoruz.
        const popup = new lib.Popup({ closeButton: true, closeOnClick: false, maxWidth: "300px", className: "data-popup" });
        popupRef.current = popup;
        // Kutu çarpıyla ya da haritada boş bir yere tıklanarak kapanınca vurgu da kalkar.
        popup.on("close", () => setFocus(map, null));
        const clickable = Object.values(SUBLAYERS)
          .flat()
          .filter((sub) => sub !== "ilce-fill" && sub !== "aqi-label");
        map.on("click", (e) => {
          const onMap = clickable.filter((id) => map.getLayer(id));
          if (!map.queryRenderedFeatures(e.point, { layers: onMap }).length) popup.remove();
        });
        for (const [layer, subs] of Object.entries(SUBLAYERS) as [LayerId, string[]][]) {
          for (const sub of subs) {
            if (!clickable.includes(sub)) continue;
            map.on("click", sub, (e: MapLayerMouseEvent) => {
              const f = e.features?.[0];
              if (!f) return;
              popup.setLngLat(e.lngLat).setHTML(popupHtml(layer, f.properties as Record<string, unknown>)).addTo(map);
              // addTo önceki kutuyu kapatıp eski vurguyu kaldırır; yenisi ondan sonra uygulanır.
              if (f.id !== undefined) setFocus(map, { layer, id: Number(f.id) });
            });
            map.on("mouseenter", sub, () => (map.getCanvas().style.cursor = "pointer"));
            map.on("mouseleave", sub, () => (map.getCanvas().style.cursor = ""));
          }
        }
        setReady(true);
      });
    })();
    return () => {
      cancelled = true;
      // Cache Components açıkken Next.js başka sayfaya geçince bu sayfayı <Activity> ile gizler:
      // efektler temizlenir ama DOM yerinde kalır. Haritayı yalnızca kapsayıcı DOM'dan gerçekten
      // çıktığında yok ediyoruz; aksi hâlde geri dönüldüğünde katmanlar ve görünüm kaybolur.
      if (el?.isConnected || !mapRef.current) return;
      liveMaps.delete(mapRef.current);
      mapRef.current.remove();
      mapRef.current = null;
    };
  }, []);

  // Katman görünürlüğü ve tembel veri yükleme.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    const load = async (id: LayerId, maxAge?: number) => {
      try {
        const data = await fetchDataset<FeatureCollection>(id, maxAge);
        let fc = data as unknown as GeoJSON.FeatureCollection;
        if (id === "depremler") {
          const now = Date.now();
          fc = {
            ...fc,
            features: fc.features.map((f) => ({
              ...f,
              properties: { ...f.properties, ageHours: (now - new Date(String(f.properties?.time)).getTime()) / 3.6e6 },
            })),
          };
        }
        (map.getSource(id) as GeoJSONSource | undefined)?.setData(fc);
        dataRef.current[id] = fc;
        if (id === "toplanma-alanlari") {
          (map.getSource("toplanma-merkez") as GeoJSONSource | undefined)?.setData({
            type: "FeatureCollection",
            features: fc.features.map((f) => ({
              type: "Feature",
              id: f.id,
              properties: f.properties,
              geometry: { type: "Point", coordinates: (f.properties as { merkez: [number, number] }).merkez },
            })),
          });
        }
        statusCb.current?.(id, { count: fc.features.length, updatedAt: new Date() });
        // Yeni veri gelince vurgular sıfırlanır; yeniden uygula.
        for (const fid of appliedHl.current[id] ?? []) setFlag(map, id, fid, "hl", true);
        if (focused.current?.layer === id) setFlag(map, id, focused.current.id, "focus", true);
      } catch (e) {
        statusCb.current?.(id, { error: (e as Error).message });
      }
    };

    for (const [id, subs] of Object.entries(SUBLAYERS) as [LayerId, string[]][]) {
      const on = layers[id];
      for (const sub of subs) map.setLayoutProperty(sub, "visibility", on ? "visible" : "none");
      if (on && !loaded.current.has(id)) {
        loaded.current.add(id);
        load(id);
      }
    }

    const timer = setInterval(() => {
      for (const id of LIVE_LAYERS) if (loaded.current.has(id)) load(id, LIVE_REFRESH_MS - 1000);
    }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [ready, layers]);

  // Asistanın istediği öğeleri vurgula.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const id of Object.keys(SUBLAYERS) as LayerId[]) {
      for (const fid of appliedHl.current[id] ?? []) setFlag(map, id, fid, "hl", false);
      for (const fid of highlights[id] ?? []) setFlag(map, id, fid, "hl", true);
    }
    appliedHl.current = highlights;
  }, [ready, highlights]);

  // maplibre kendi kapsayıcısına position: relative verdiği için ayrı bir sarmalayıcı kullanıyoruz.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
      <MapLegend layers={layers} hidden={hideLegend} />
    </div>
  );
}

const QUAKE_LEGEND = [
  { c: "#dc2626", t: "Son 24 saat" },
  { c: "#f97316", t: "Son 7 gün" },
  { c: "#facc15", t: "Daha eski" },
];

function MapLegend({ layers, hidden }: { layers: Record<LayerId, boolean>; hidden?: boolean }) {
  // Lejant kapalı başlar; kullanıcı istediğinde açar.
  const aqi = layers["hava-kalitesi"];
  const quake = layers.depremler;

  return (
    <details
      className={`group absolute bottom-12 left-3 rounded-2xl border border-line bg-card/95 shadow-lg shadow-ink/5 backdrop-blur open:w-64 ${(aqi || quake) && !hidden ? "" : "hidden"}`}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-ink select-none [&::-webkit-details-marker]:hidden">
        <Icon name="layers" className="h-3.5 w-3.5 text-accent" />
        Lejant
        <Icon name="arrowRight" className="ml-auto h-3 w-3 text-faint transition group-open:rotate-90" />
      </summary>
      <div className="space-y-3 border-t border-line px-3 py-2.5 text-[11px] leading-snug text-dim">
        {aqi && (
          <div>
            <p className="font-medium text-ink">Hava kalitesi</p>
            <p>Dairedeki sayı, Avrupa Hava Kalitesi İndeksi&apos;dir (EAQI). Değer düştükçe hava daha temizdir.</p>
            <ul className="mt-1 space-y-0.5">
              {AQI_LEVELS.map((l) => (
                <li key={l.range} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: l.color }} />
                  <span className="w-11 font-mono text-[10.5px] text-ink">{l.range}</span>
                  {l.text}
                </li>
              ))}
            </ul>
          </div>
        )}
        {quake && (
          <div>
            <p className="font-medium text-ink">Depremler</p>
            <p>Daire büyüdükçe deprem büyüklüğü (M) artar; renk ne zaman olduğunu gösterir.</p>
            <p className="mt-1 text-faint">İl dışındaki depremler yalnızca Bursa&apos;da hissedilebilecek büyüklükteyse gösterilir.</p>
            <ul className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5">
              {QUAKE_LEGEND.map((g) => (
                <li key={g.t} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: g.c }} />
                  {g.t}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

function setFlag(map: MlMap, layer: LayerId, id: number, key: "hl" | "focus", on: boolean) {
  map.setFeatureState({ source: layer, id }, { [key]: on });
  if (layer === "toplanma-alanlari") map.setFeatureState({ source: "toplanma-merkez", id }, { [key]: on });
}
