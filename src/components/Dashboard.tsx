"use client";

import { useCallback, useRef, useState } from "react";
import type { LayerId, MapAction, PanelId } from "@/lib/map-actions";
import ChatPanel from "./ChatPanel";
import InfoCard from "./InfoCards";
import LayerPanel, { type LayerStatus } from "./LayerPanel";
import MapView, { type MapHandle } from "./MapView";
import SiteHeader from "./SiteHeader";
import StatStrip from "./StatStrip";

const INITIAL_LAYERS: Record<LayerId, boolean> = {
  depremler: true,
  "hava-kalitesi": true,
  "ilce-sinirlari": true,
  "toplanma-alanlari": false,
  parklar: false,
  "wifi-noktalari": false,
};

export default function Dashboard() {
  const mapRef = useRef<MapHandle>(null);
  const [tab, setTab] = useState<"chat" | "layers">("chat");
  const [layers, setLayers] = useState(INITIAL_LAYERS);
  const [highlights, setHighlights] = useState<Partial<Record<LayerId, number[]>>>({});
  const [status, setStatus] = useState<Partial<Record<LayerId, LayerStatus>>>({});
  const [panel, setPanel] = useState<{ id: PanelId; query?: string } | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number]>();
  const [locating, setLocating] = useState(false);

  const applyActions = useCallback((actions: MapAction[]) => {
    if (!actions.length) return;
    const hl: Partial<Record<LayerId, number[]>> = {};
    let marker = false;
    for (const a of actions) {
      switch (a.type) {
        case "showLayer":
          setLayers((l) => ({ ...l, [a.layer]: true }));
          break;
        case "highlight":
          hl[a.layer] = [...(hl[a.layer] ?? []), ...a.ids];
          break;
        case "flyTo":
          mapRef.current?.flyTo(a.center, a.zoom);
          break;
        case "fitBounds":
          mapRef.current?.fitBounds(a.bounds);
          break;
        case "marker":
          marker = true;
          mapRef.current?.setMarker(a.center, a.label);
          break;
        case "openPanel":
          setPanel({ id: a.panel, query: a.query });
          break;
      }
    }
    // Her yeni yanıt önceki vurguları ve işaretçiyi temizler.
    setHighlights(hl);
    if (!marker) mapRef.current?.setMarker(null);
  }, []);

  const onLayerStatus = useCallback((id: LayerId, s: LayerStatus) => setStatus((prev) => ({ ...prev, [id]: s })), []);

  const requestLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setUserLocation(c);
        setLocating(false);
        mapRef.current?.setMarker(c, "Konumunuz");
        mapRef.current?.flyTo(c, 13);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50">
      <SiteHeader active="harita" />
      <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
        <aside className="flex h-[55dvh] min-h-0 w-full flex-col border-t border-slate-200 bg-slate-50 md:h-auto md:w-[420px] md:flex-none md:border-r md:border-t-0">
          <StatStrip onActions={applyActions} />
          <div className="mx-4 mt-3 grid grid-cols-2 rounded-lg bg-slate-200/70 p-1 text-sm">
            {(["chat", "layers"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md py-1.5 font-medium transition ${tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
              >
                {t === "chat" ? "Asistan" : "Katmanlar"}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            <div className={tab === "chat" ? "h-full" : "hidden"}>
              <ChatPanel
                onActions={applyActions}
                getContext={() => ({ userLocation, mapCenter: mapRef.current?.getCenter() })}
                userLocation={userLocation}
                onRequestLocation={requestLocation}
                locating={locating}
              />
            </div>
            <div className={tab === "layers" ? "h-full" : "hidden"}>
              <LayerPanel layers={layers} status={status} onToggle={(id) => setLayers((l) => ({ ...l, [id]: !l[id] }))} />
            </div>
          </div>
        </aside>

        <main className="relative min-h-0 flex-1">
          <MapView ref={mapRef} layers={layers} highlights={highlights} onLayerStatus={onLayerStatus} />
          {panel && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 top-3 flex items-end justify-end md:inset-x-auto md:right-14 md:w-[380px]">
              <div className="pointer-events-auto flex max-h-full w-full flex-col">
                <InfoCard panel={panel} onClose={() => setPanel(null)} />
              </div>
            </div>
          )}
          <div className="pointer-events-none absolute left-3 top-3 hidden gap-2 md:flex">
            {(["etkinlik"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPanel({ id: p })}
                className="pointer-events-auto rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow ring-1 ring-slate-200 hover:text-teal-700"
              >
                🎭 Etkinlikler
              </button>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
