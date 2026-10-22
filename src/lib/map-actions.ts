// Asistanın harita üzerinde yapabileceği eylemler. Sunucu tarafındaki araçlar
// bunları üretir, istemci tarafı haritaya uygular.

export type LayerId =
  | "depremler"
  | "hava-kalitesi"
  | "toplanma-alanlari"
  | "ilce-sinirlari"
  | "parklar"
  | "wifi-noktalari";

export type PanelId = "baraj" | "hal" | "etkinlik";

export type MapAction =
  | { type: "flyTo"; center: [number, number]; zoom: number }
  | { type: "fitBounds"; bounds: [number, number, number, number] }
  | { type: "showLayer"; layer: LayerId }
  | { type: "highlight"; layer: LayerId; ids: number[] }
  // Öğenin bilgi kutusunu açar; kutu kapanınca vurgu kalkar.
  | { type: "focus"; layer: LayerId; id: number }
  | { type: "marker"; center: [number, number]; label: string }
  | { type: "openPanel"; panel: PanelId; query?: string };
