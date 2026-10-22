"use client";

import { useCallback, useRef, useState } from "react";
import type { LayerId, MapAction, PanelId } from "@/lib/map-actions";
import AssistantWidget from "./AssistantWidget";
import EventsPanel from "./EventsPanel";
import { Icon } from "./Icons";
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

// GeolocationPositionError kodları: 1 izin yok, 2 konum belirlenemedi, 3 zaman aşımı.
function locationErrorText(code: number): string {
  switch (code) {
    case 1:
      return "Konum izni verilmedi. Tarayıcının site ayarlarından (gerekirse cihazın konum servislerinden de) izin verip tekrar deneyin.";
    case 3:
      return "Konum alınırken zaman aşımı oldu. Tekrar deneyin.";
    default:
      return "Konumunuz belirlenemedi. Cihazın konum servislerinin açık olduğundan emin olup tekrar deneyin.";
  }
}

type SidebarTab = "map" | "events";
const TABS: { id: SidebarTab; label: string; icon: "map" | "calendarDays" }[] = [
  { id: "map", label: "Harita", icon: "map" },
  { id: "events", label: "Etkinlikler", icon: "calendarDays" },
];

export default function Dashboard() {
  const mapRef = useRef<MapHandle>(null);
  const [layers, setLayers] = useState(INITIAL_LAYERS);
  const [highlights, setHighlights] = useState<Partial<Record<LayerId, number[]>>>({});
  const [status, setStatus] = useState<Partial<Record<LayerId, LayerStatus>>>({});
  // Etkinlikler artık harita üstünde kart değil, sol panelin kendi sekmesi.
  const [panel, setPanel] = useState<{ id: Exclude<PanelId, "etkinlik">; query?: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("map");
  const [userLocation, setUserLocation] = useState<[number, number]>();
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string>();
  const [chatOpen, setChatOpen] = useState(false);

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
        case "focus":
          mapRef.current?.focus(a.layer, a.id);
          break;
        case "fitBounds":
          mapRef.current?.fitBounds(a.bounds);
          break;
        case "marker":
          marker = true;
          mapRef.current?.setMarker(a.center, a.label);
          break;
        case "openPanel":
          if (a.panel === "etkinlik") {
            setSidebarTab("events");
            setSidebarOpen(true);
          } else {
            setPanel({ id: a.panel, query: a.query });
          }
          break;
      }
    }
    // Her yeni yanıt önceki vurguları ve işaretçiyi temizler.
    setHighlights(hl);
    if (!marker) mapRef.current?.setMarker(null);
  }, []);

  const onLayerStatus = useCallback((id: LayerId, s: LayerStatus) => setStatus((prev) => ({ ...prev, [id]: s })), []);

  const requestLocation = () => {
    setLocationError(undefined);
    // Tarayıcılar konumu yalnızca https veya localhost üzerinde verir; yerel ağ adresinden
    // (http://192.168…) açılınca istek sessizce reddedilir.
    if (!window.isSecureContext) {
      setLocationError("Konum yalnızca güvenli bağlantıda (https) paylaşılabilir. Bu sayfa http ile açıldığı için tarayıcı konuma izin vermiyor.");
      return;
    }
    if (!navigator.geolocation) {
      setLocationError("Tarayıcınız konum paylaşmayı desteklemiyor.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setUserLocation(c);
        setLocating(false);
        mapRef.current?.setMarker(c, "Konumunuz");
        mapRef.current?.flyTo(c, 13);
      },
      (err) => {
        setLocating(false);
        setLocationError(locationErrorText(err.code));
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-base">
      <SiteHeader active="harita" />
      <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
        <aside
          className={`${sidebarOpen ? "flex" : "hidden"} h-[48dvh] min-h-0 w-full flex-col border-t border-line bg-panel md:h-auto md:w-[420px] md:flex-none md:border-r md:border-t-0`}
        >
          <div className="flex items-center gap-2 px-4 pt-4">
            <div role="tablist" className="grid flex-1 grid-cols-2 gap-1 rounded-xl border border-line bg-base p-1 text-sm">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={sidebarTab === t.id}
                  onClick={() => setSidebarTab(t.id)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 font-medium transition ${sidebarTab === t.id ? "bg-card text-accent shadow-sm ring-1 ring-line" : "text-faint hover:text-dim"}`}
                >
                  <Icon name={t.icon} className="h-4 w-4" />
                  {t.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="Paneli kapat"
              title="Paneli kapat"
              className="grid h-10 w-10 flex-none place-items-center rounded-xl border border-line bg-card text-faint transition hover:border-accent/40 hover:text-accent"
            >
              {/* Telefonda panel alttan açıldığı için ok aşağıyı gösterir. */}
              <Icon name="panelClose" className="h-[18px] w-[18px] max-md:-rotate-90" />
            </button>
          </div>

          {/* İki sekme de bağlı kalır; geçişte kaydırma konumu ve seçili süzgeç korunur. */}
          <div className={sidebarTab === "map" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <StatStrip onActions={applyActions} />
            <div className="mx-4 mt-5 flex items-center justify-between border-b border-line pb-2.5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Icon name="layers" className="h-4 w-4 text-accent" />
                Harita katmanları
              </h2>
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                {Object.values(layers).filter(Boolean).length} açık
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <LayerPanel layers={layers} status={status} onToggle={(id) => setLayers((l) => ({ ...l, [id]: !l[id] }))} />
            </div>
          </div>
          <div className={sidebarTab === "events" ? "min-h-0 flex-1" : "hidden"}>
            <EventsPanel />
          </div>
        </aside>

        <main className="relative min-h-0 flex-1 bg-base">
          <MapView ref={mapRef} layers={layers} highlights={highlights} onLayerStatus={onLayerStatus} hideLegend={!!panel || chatOpen} />
          <AssistantWidget
            onActions={applyActions}
            getContext={() => ({ userLocation, mapCenter: mapRef.current?.getCenter() })}
            userLocation={userLocation}
            onRequestLocation={requestLocation}
            locating={locating}
            locationError={locationError}
            onOpenChange={setChatOpen}
          />
          {/* Sağ taraf asistanın; bilgi kartları solda açılır. */}
          {panel && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 top-3 z-[35] flex items-end justify-start md:inset-x-auto md:left-3 md:w-[380px]">
              <div className="pointer-events-auto flex max-h-full w-full flex-col">
                <InfoCard panel={panel} onClose={() => setPanel(null)} />
              </div>
            </div>
          )}
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="absolute left-3 top-3 z-20 flex items-center gap-2 rounded-xl border border-line bg-card/95 px-3 py-2 text-xs font-medium text-ink shadow-md shadow-ink/5 backdrop-blur transition hover:border-accent/40 hover:text-accent"
            >
              <Icon name="panelOpen" className="h-4 w-4 text-accent max-md:-rotate-90" />
              Paneli aç
            </button>
          )}
        </main>
      </div>
    </div>
  );
}
