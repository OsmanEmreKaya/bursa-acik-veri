"use client";

import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent, Marker as MlMarker } from "maplibre-gl";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { aqiText, fetchDataset, timeAgo, trDateTime } from "@/lib/client-data";
import type { FeatureCollection } from "@/lib/geo";
import type { LayerId } from "@/lib/map-actions";

export type MapHandle = {
  flyTo: (center: [number, number], zoom: number) => void;
  fitBounds: (b: [number, number, number, number]) => void;
  setMarker: (center: [number, number] | null, label?: string) => void;
  getCenter: () => [number, number] | undefined;
};

type Props = {
  ref?: Ref<MapHandle>;
  layers: Record<LayerId, boolean>;
  highlights: Partial<Record<LayerId, number[]>>;
  onLayerStatus?: (id: LayerId, status: { count?: number; error?: string; updatedAt?: Date }) => void;
};

const STYLE = "https://tiles.openfreemap.org/styles/positron";
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

const hl = (on: unknown, off: unknown) => ["case", ["boolean", ["feature-state", "hl"], false], on, off];

function addLayers(map: MlMap) {
  const empty = { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection;
  for (const id of Object.keys(SUBLAYERS)) map.addSource(id, { type: "geojson", data: empty });
  map.addSource("toplanma-merkez", { type: "geojson", data: empty });

  map.addLayer({
    id: "ilce-fill", type: "fill", source: "ilce-sinirlari",
    paint: { "fill-color": "#0f766e", "fill-opacity": hl(0.12, 0) as never },
  });
  map.addLayer({
    id: "ilce-line", type: "line", source: "ilce-sinirlari",
    paint: { "line-color": "#0f766e", "line-width": hl(3, 1.2) as never, "line-opacity": 0.7 },
  });

  map.addLayer({
    id: "toplanma-fill", type: "fill", source: "toplanma-alanlari", minzoom: 12,
    paint: { "fill-color": hl("#16a34a", "#22c55e") as never, "fill-opacity": hl(0.6, 0.3) as never },
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
      "circle-stroke-color": "#fff",
      "circle-stroke-width": hl(2, 0.5) as never,
    },
  });

  map.addLayer({
    id: "park-circle", type: "circle", source: "parklar",
    paint: {
      "circle-radius": hl(10, 6) as never,
      "circle-color": "#65a30d",
      "circle-stroke-color": hl("#1a2e05", "#fff") as never,
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "wifi-circle", type: "circle", source: "wifi-noktalari",
    paint: {
      "circle-radius": hl(9, 5) as never,
      "circle-color": "#2563eb",
      "circle-stroke-color": hl("#1e1b4b", "#fff") as never,
      "circle-stroke-width": 1.5,
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
      "circle-opacity": 0.85,
      "circle-stroke-color": hl("#111827", "#ffffff") as never,
      "circle-stroke-width": hl(3, 2) as never,
    },
  });
  map.addLayer({
    id: "aqi-label", type: "symbol", source: "hava-kalitesi",
    layout: {
      "text-field": ["to-string", ["coalesce", ["get", "aqi"], "–"]],
      "text-font": ["Noto Sans Bold"],
      "text-size": 12,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#111827" },
  });

  map.addLayer({
    id: "quake-circle", type: "circle", source: "depremler",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["get", "mag"], 0, 4, 2, 7, 3, 11, 4, 16, 5, 24, 6, 34],
      "circle-color": [
        "step", ["get", "ageHours"], "#dc2626", 24, "#f97316", 168, "#facc15",
      ],
      "circle-opacity": hl(0.95, 0.7) as never,
      "circle-stroke-color": hl("#111827", "#7f1d1d") as never,
      "circle-stroke-width": hl(3, 1) as never,
    },
  });
}

function popupHtml(layer: LayerId, p: Record<string, unknown>): string {
  const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const row = (k: string, v: unknown) => (v === null || v === undefined || v === "" ? "" : `<div><span>${k}</span><b>${esc(v)}</b></div>`);
  switch (layer) {
    case "depremler":
      return `<h4>M${esc(p.mag)} · ${esc(p.place)}</h4>${row("Zaman", trDateTime(String(p.time)))}${row("Ne zaman", timeAgo(String(p.time)))}${row("Derinlik", `${p.depth} km`)}${row("Kaynak", "AFAD")}`;
    case "hava-kalitesi":
      return `<h4>${esc(p.ilce)} · ${aqiText(p.aqi as number | null)}</h4>${row("Avrupa AQI", p.aqi)}${row("PM2.5", p.pm2_5 != null ? `${p.pm2_5} µg/m³` : null)}${row("PM10", p.pm10 != null ? `${p.pm10} µg/m³` : null)}${row("NO₂", p.no2 != null ? `${p.no2} µg/m³` : null)}${row("Sıcaklık", p.temperature != null ? `${p.temperature} °C` : null)}${row("Nem", p.humidity != null ? `%${p.humidity}` : null)}${row("Rüzgar", p.wind != null ? `${p.wind} km/sa` : null)}`;
    case "toplanma-alanlari":
      return `<h4>${esc(p.ad)}</h4>${row("Mahalle", p.mahalle)}${row("İlçe", p.ilce)}<p class="muted">Afet toplanma alanı</p>`;
    case "parklar":
      return `<h4>${esc(p.ad)}</h4><p>${esc(String(p.ozet ?? "").slice(0, 180))}</p>${row("Adres", p.adres)}`;
    case "wifi-noktalari":
      return `<h4>${esc(p.ad)}</h4><p class="muted">Ücretsiz belediye Wi-Fi noktası</p>`;
    case "ilce-sinirlari":
      return `<h4>${esc(p.ad)}</h4>`;
  }
}

export default function MapView({ ref, layers, highlights, onLayerStatus }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerRef = useRef<MlMarker | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const loaded = useRef<Set<LayerId>>(new Set());
  const appliedHl = useRef<Partial<Record<LayerId, number[]>>>({});
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
      markerRef.current = new lib.Marker({ color: "#0f172a" })
        .setLngLat(center)
        .setPopup(new lib.Popup({ offset: 24 }).setText(label ?? ""))
        .addTo(mapRef.current);
    },
    getCenter: () => {
      const c = mapRef.current?.getCenter();
      return c ? [c.lng, c.lat] : undefined;
    },
  }));

  // Haritayı bir kez oluştur.
  useEffect(() => {
    let cancelled = false;
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
        attributionControl: { compact: true },
      });
      map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new lib.ScaleControl({ unit: "metric" }), "bottom-left");
      mapRef.current = map;

      map.on("load", () => {
        addLayers(map);
        const popup = new lib.Popup({ closeButton: true, maxWidth: "300px", className: "data-popup" });
        for (const [layer, subs] of Object.entries(SUBLAYERS) as [LayerId, string[]][]) {
          for (const sub of subs) {
            if (sub === "ilce-fill" || sub === "aqi-label") continue;
            map.on("click", sub, (e: MapLayerMouseEvent) => {
              const f = e.features?.[0];
              if (!f) return;
              popup.setLngLat(e.lngLat).setHTML(popupHtml(layer, f.properties as Record<string, unknown>)).addTo(map);
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
      mapRef.current?.remove();
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
        for (const fid of appliedHl.current[id] ?? []) setHl(map, id, fid, true);
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
      for (const fid of appliedHl.current[id] ?? []) setHl(map, id, fid, false);
      for (const fid of highlights[id] ?? []) setHl(map, id, fid, true);
    }
    appliedHl.current = highlights;
  }, [ready, highlights]);

  // maplibre kendi kapsayıcısına position: relative verdiği için ayrı bir sarmalayıcı kullanıyoruz.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
    </div>
  );
}

function setHl(map: MlMap, layer: LayerId, id: number, on: boolean) {
  map.setFeatureState({ source: layer, id }, { hl: on });
  if (layer === "toplanma-alanlari") map.setFeatureState({ source: "toplanma-merkez", id }, { hl: on });
}
