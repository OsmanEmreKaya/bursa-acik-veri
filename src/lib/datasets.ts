import { cached, cacheInfo, fetchJson } from "./cache";
import { centroid, containsPoint, distanceToEdgeKm, type Feature, type FeatureCollection, normalizeTr, roundCoords, titleCaseTr } from "./geo";

const BAPI = "https://bapi.bursa.bel.tr/apigateway";
const MIN = 60_000;

// Bursa ili ve yakın çevresini kapsayan kutu: buradaki tüm depremler sorgulanır, il içindekiler her büyüklükte gösterilir.
const QUAKE_BOX = { minlat: 39.55, maxlat: 40.75, minlon: 27.9, maxlon: 30.2 };
// Bursa sınırının ~200 km çevresi: il dışındaki depremler yalnızca Bursa'da hissedilebilecek büyüklükteyse gösterilir.
const FELT_BOX = { minlat: 37.8, maxlat: 42.5, minlon: 25.6, maxlon: 32.5 };
// Bursa sınırına uzaklığa göre hissedilmek için gereken en küçük büyüklük (hissedilme raporlarındaki tipik yarıçaplara göre kaba eşikler).
export const FELT_RULES = [
  { km: 30, mag: 3 },
  { km: 100, mag: 4 },
  { km: 200, mag: 5 },
];

// ---------- Tipler ----------

export type QuakeProps = {
  id: string;
  mag: number;
  magType: string;
  depth: number;
  place: string;
  province: string;
  district: string;
  time: string; // ISO, UTC
  inBursa: boolean;
  distanceKm: number; // Bursa sınırına uzaklık; il içinde 0
};

export type AirProps = {
  ilce: string;
  aqi: number | null;
  pm2_5: number | null;
  pm10: number | null;
  no2: number | null;
  o3: number | null;
  temperature: number | null;
  humidity: number | null;
  wind: number | null;
  weatherCode: number | null;
  time: string;
};

export type DamData = {
  current: { date: string; percent: number; remainingM3: number; capacityM3: number };
  series: { date: string; percent: number }[];
};

export type MarketRow = { kategori: string; urun: string; min: number; max: number; birim: string; tarih: string };

export type EventRow = {
  id: string;
  ad: string;
  baslangic: string;
  bitis: string;
  kategori: string;
  mekan: string | null;
  link: string | null;
  gorsel: string | null;
};

export type DatasetId =
  | "depremler"
  | "hava-kalitesi"
  | "baraj-doluluk"
  | "hal-fiyatlari"
  | "toplanma-alanlari"
  | "ilce-sinirlari"
  | "parklar"
  | "wifi-noktalari"
  | "etkinlikler";

type DatasetMeta = {
  id: DatasetId;
  title: string;
  description: string;
  publisher: string;
  sourceUrl: string;
  upstream: string;
  refresh: string;
  ttlMs: number;
  live: boolean;
  kind: "geojson" | "table" | "timeseries";
};

// ---------- Yükleyiciler ----------

type AfadEvent = {
  eventID: string; latitude: string; longitude: string; depth: string; type: string; magnitude: string;
  location: string; province: string | null; district: string | null; date: string;
};

function fetchAfad(box: typeof QUAKE_BOX, start: Date, end: Date, minMag?: number) {
  const iso = (d: Date) => d.toISOString().slice(0, 19);
  const q = new URLSearchParams({
    start: iso(start),
    end: iso(end),
    minlat: String(box.minlat),
    maxlat: String(box.maxlat),
    minlon: String(box.minlon),
    maxlon: String(box.maxlon),
    orderby: "timedesc",
  });
  if (minMag !== undefined) q.set("minmag", String(minMag));
  return fetchJson<AfadEvent[]>(`https://servisnet.afad.gov.tr/apigateway/deprem/apiv2/event/filter?${q}`);
}

const feltInBursa = (mag: number, km: number) => FELT_RULES.some((r) => km <= r.km && mag >= r.mag);

async function loadQuakes(): Promise<FeatureCollection<QuakeProps>> {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 3600 * 1000);
  const minFelt = Math.min(...FELT_RULES.map((r) => r.mag));
  const [near, wide, districts] = await Promise.all([
    fetchAfad(QUAKE_BOX, start, end),
    fetchAfad(FELT_BOX, start, end, minFelt),
    getDataset("ilce-sinirlari"),
  ]);
  const shapes = districts.features.map((f) => f.geometry);
  const byId = new Map([...near, ...wide].map((r) => [r.eventID, r]));

  const features: Feature<QuakeProps>[] = [];
  for (const r of byId.values()) {
    const point: [number, number] = [Number(r.longitude), Number(r.latitude)];
    const mag = Number(r.magnitude);
    // AFAD'ın il bilgisi bazen boş gelir (ör. kıyıya yakın kayıtlar); ilçe sınırlarıyla da kontrol edilir.
    const inBursa = normalizeTr(r.province ?? "") === "bursa" || shapes.some((g) => containsPoint(g, point));
    const distanceKm = inBursa ? 0 : Math.round(distanceToEdgeKm(shapes, point));
    if (!inBursa && !feltInBursa(mag, distanceKm)) continue;
    features.push({
      type: "Feature",
      id: Number(r.eventID),
      geometry: { type: "Point", coordinates: point },
      properties: {
        id: r.eventID,
        mag,
        magType: r.type,
        depth: Number(r.depth),
        place: r.location,
        province: r.province ?? "",
        district: r.district ?? "",
        // AFAD saatleri UTC verir (Kandilli kayıtlarıyla karşılaştırılarak doğrulandı).
        time: `${r.date}Z`,
        inBursa,
        distanceKm,
      },
    });
  }
  features.sort((a, b) => b.properties.time.localeCompare(a.properties.time));
  return { type: "FeatureCollection", features };
}

async function loadDistricts(): Promise<FeatureCollection<{ ad: string; merkez: [number, number] }>> {
  const raw = await fetchJson<FeatureCollection<{ AD: string }>>(`${BAPI}/bbbAcikVeri_Cbs/ILCE`);
  return {
    type: "FeatureCollection",
    features: raw.features.map((f, i) => ({
      type: "Feature",
      id: i,
      geometry: roundCoords(f.geometry),
      properties: { ad: titleCaseTr(f.properties.AD), merkez: centroid(f.geometry) },
    })),
  };
}

async function loadAir(): Promise<FeatureCollection<AirProps>> {
  const districts = await getDataset("ilce-sinirlari");
  const points = districts.features.map((f) => ({ ilce: f.properties.ad, c: f.properties.merkez }));
  const lat = points.map((p) => p.c[1].toFixed(4)).join(",");
  const lon = points.map((p) => p.c[0].toFixed(4)).join(",");

  type AqRes = { current: { time: string; european_aqi: number; pm2_5: number; pm10: number; nitrogen_dioxide: number; ozone: number } };
  type WxRes = { current: { temperature_2m: number; relative_humidity_2m: number; wind_speed_10m: number; weather_code: number } };
  const [aq, wx] = await Promise.all([
    fetchJson<AqRes[] | AqRes>(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone&timezone=Europe%2FIstanbul`,
    ),
    fetchJson<WxRes[] | WxRes>(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=Europe%2FIstanbul`,
    ),
  ]);
  const aqList = Array.isArray(aq) ? aq : [aq];
  const wxList = Array.isArray(wx) ? wx : [wx];

  return {
    type: "FeatureCollection",
    features: points.map((p, i) => ({
      type: "Feature",
      id: i,
      geometry: { type: "Point", coordinates: p.c },
      properties: {
        ilce: p.ilce,
        aqi: aqList[i]?.current.european_aqi ?? null,
        pm2_5: aqList[i]?.current.pm2_5 ?? null,
        pm10: aqList[i]?.current.pm10 ?? null,
        no2: aqList[i]?.current.nitrogen_dioxide ?? null,
        o3: aqList[i]?.current.ozone ?? null,
        temperature: wxList[i]?.current.temperature_2m ?? null,
        humidity: wxList[i]?.current.relative_humidity_2m ?? null,
        wind: wxList[i]?.current.wind_speed_10m ?? null,
        weatherCode: wxList[i]?.current.weather_code ?? null,
        time: aqList[i]?.current.time ?? "",
      },
    })),
  };
}

async function loadDam(): Promise<DamData> {
  type Cur = { sonuc: { olcumTarihi: number; dolulukOrani: number; kalanHacim: number; barajKapasitesi: number }[] };
  type Ser = { sonuc: { olcumTarihi: string; olcumVerisi: number }[] };
  const [cur, ser] = await Promise.all([
    fetchJson<Cur>(`${BAPI}/bbbAcikVeri_Buski/baraj`),
    fetchJson<Ser>(`${BAPI}/bbbAcikVeri_Buski/baraj/dolulukOrani/gunluk`),
  ]);
  const c = cur.sonuc[0];
  const series = ser.sonuc
    .map((s) => ({ date: s.olcumTarihi, percent: Math.round(s.olcumVerisi * 1000) / 10 }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    current: {
      date: new Date(c.olcumTarihi).toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" }),
      percent: c.dolulukOrani,
      remainingM3: Math.round(c.kalanHacim),
      capacityM3: c.barajKapasitesi,
    },
    series,
  };
}

async function loadMarket(): Promise<MarketRow[]> {
  type Raw = { KategoriIsim: string; urun_ad: string; min: string; max: string; tarih: string; br: string };
  const raw = await fetchJson<Raw[]>(`${BAPI}/acikveri/hal-fiyatlari`);
  const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
  return raw.map((r) => ({
    kategori: r.KategoriIsim,
    urun: r.urun_ad.trim(),
    min: num(r.min),
    max: num(r.max),
    birim: r.br.replace(/[().\s]/g, "").toLocaleLowerCase("tr-TR").replace("kğ", "kg"),
    tarih: r.tarih,
  }));
}

async function loadAssembly(): Promise<FeatureCollection<{ ad: string; ilce: string; mahalle: string; merkez: [number, number] }>> {
  type Raw = { ad: string; ilce: string; mahalle: string };
  const raw = await fetchJson<FeatureCollection<Raw>>(`${BAPI}/bbbAcikVeri_Cbs/Toplanma_yerleri`, 30_000);
  return {
    type: "FeatureCollection",
    features: raw.features.map((f, i) => ({
      type: "Feature",
      id: i,
      geometry: roundCoords(f.geometry),
      properties: {
        ad: f.properties.ad.replace(/\s+/g, " ").trim(),
        ilce: titleCaseTr(f.properties.ilce),
        mahalle: titleCaseTr(f.properties.mahalle),
        merkez: centroid(f.geometry),
      },
    })),
  };
}

const stripHtml = (s: string) =>
  s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, (m) => decodeEntity(m)).replace(/\s+/g, " ").trim();

function decodeEntity(e: string): string {
  const map: Record<string, string> = {
    "&uuml;": "ü", "&Uuml;": "Ü", "&ouml;": "ö", "&Ouml;": "Ö", "&ccedil;": "ç", "&Ccedil;": "Ç",
    "&amp;": "&", "&quot;": '"', "&rsquo;": "’", "&lsquo;": "‘", "&ldquo;": "“", "&rdquo;": "”", "&hellip;": "…",
  };
  return map[e] ?? " ";
}

async function loadParks(): Promise<FeatureCollection<{ ad: string; adres: string; ozet: string; gorsel: string | null }>> {
  type Raw = { title: string; address: string; content_summary: string; image_url?: string };
  const raw = await fetchJson<FeatureCollection<Raw>>(`${BAPI}/acik_veri_turizm/parklar`);
  return {
    type: "FeatureCollection",
    features: raw.features.map((f, i) => ({
      type: "Feature",
      id: i,
      geometry: f.geometry,
      properties: {
        ad: f.properties.title,
        adres: f.properties.address,
        ozet: stripHtml(f.properties.content_summary ?? ""),
        gorsel: f.properties.image_url ?? null,
      },
    })),
  };
}

async function loadWifi(): Promise<FeatureCollection<{ ad: string }>> {
  const raw = await fetchJson<FeatureCollection<{ baslik: string | null }>>(`${BAPI}/acikveri/mobil_kesfet_acikveri/179`);
  return {
    type: "FeatureCollection",
    features: raw.features
      .filter((f) => f.geometry)
      .map((f, i) => ({
        type: "Feature",
        id: i,
        geometry: f.geometry,
        properties: { ad: f.properties.baslik?.trim() || "Wi-Fi noktası" },
      })),
  };
}

async function loadEvents(): Promise<EventRow[]> {
  type Raw = {
    id: string; adi: string; tarih_baslama: string; tarih_bitis: string; kategori: string;
    mekan: string; diger_mekan: string; link: string; foto_url: string;
  };
  const raw = await fetchJson<Raw[]>(`${BAPI}/acikveri/etkinlik`);
  const clean = (s: string | null | undefined) => (s && s !== "None" ? s : null);
  return raw.map((r) => ({
    id: String(r.id),
    ad: stripHtml(r.adi),
    baslangic: r.tarih_baslama,
    bitis: r.tarih_bitis,
    kategori: r.kategori,
    mekan: clean(r.mekan) ?? clean(r.diger_mekan),
    link: clean(r.link),
    gorsel: clean(r.foto_url),
  }));
}

// ---------- Katalog ----------

const PORTAL = "https://acikyesil.bursa.bel.tr/dataset";

export const DATASETS: (DatasetMeta & { load: () => Promise<unknown> })[] = [
  {
    id: "depremler",
    title: "Depremler (son 30 gün)",
    description:
      "Son 30 günde Bursa il sınırları içinde kaydedilen tüm depremler ile il dışında olup Bursa'da hissedilebilecek büyüklükteki depremler (30 km içinde M3+, 100 km içinde M4+, 200 km içinde M5+). Büyüklük, derinlik, konum ve Bursa'ya uzaklık bilgisi içerir.",
    publisher: "AFAD Deprem Dairesi",
    sourceUrl: "https://deprem.afad.gov.tr/event-catalog",
    upstream: "https://servisnet.afad.gov.tr/apigateway/deprem/apiv2/event/filter",
    refresh: "5 dakikada bir",
    ttlMs: 5 * MIN,
    live: true,
    kind: "geojson",
    load: loadQuakes,
  },
  {
    id: "hava-kalitesi",
    title: "Hava Kalitesi ve Hava Durumu",
    description: "17 ilçe merkezi için anlık Avrupa Hava Kalitesi İndeksi (EAQI), PM2.5, PM10, NO₂, O₃ ile sıcaklık, nem ve rüzgar.",
    publisher: "Open-Meteo (CAMS / ECMWF modelleri)",
    sourceUrl: "https://open-meteo.com/en/docs/air-quality-api",
    upstream: "https://air-quality-api.open-meteo.com/v1/air-quality",
    refresh: "30 dakikada bir",
    ttlMs: 30 * MIN,
    live: true,
    kind: "geojson",
    load: loadAir,
  },
  {
    id: "baraj-doluluk",
    title: "Baraj Doluluk Oranı",
    description: "BUSKİ'nin Bursa geneli içme suyu barajları için günlük doluluk oranı ve 2021'den bugüne zaman serisi.",
    publisher: "BUSKİ / Bursa Büyükşehir Belediyesi",
    sourceUrl: `${PORTAL}/baraj-doluluk`,
    upstream: `${BAPI}/bbbAcikVeri_Buski/baraj`,
    refresh: "Saatte bir (kaynak günlük günceller)",
    ttlMs: 60 * MIN,
    live: true,
    kind: "timeseries",
    load: loadDam,
  },
  {
    id: "hal-fiyatlari",
    title: "Hal Fiyatları",
    description: "Bursa Büyükşehir Belediyesi toptancı halinde günlük meyve, sebze ve su ürünleri en düşük / en yüksek fiyatları.",
    publisher: "Bursa Büyükşehir Belediyesi",
    sourceUrl: `${PORTAL}/hal-fiyatlari`,
    upstream: `${BAPI}/acikveri/hal-fiyatlari`,
    refresh: "Saatte bir (kaynak günlük günceller)",
    ttlMs: 60 * MIN,
    live: true,
    kind: "table",
    load: loadMarket,
  },
  {
    id: "etkinlikler",
    title: "Etkinlikler",
    description: "Belediyenin duyurduğu güncel kültür, sanat ve şehir etkinlikleri.",
    publisher: "Bursa Büyükşehir Belediyesi",
    sourceUrl: `${PORTAL}/etkinlikler`,
    upstream: `${BAPI}/acikveri/etkinlik`,
    refresh: "Saatte bir",
    ttlMs: 60 * MIN,
    live: true,
    kind: "table",
    load: loadEvents,
  },
  {
    id: "toplanma-alanlari",
    title: "Afet Toplanma Alanları",
    description: "Afet ve acil durumlarda kullanılacak toplanma alanlarının sınırları; ilçe ve mahalle bilgisiyle.",
    publisher: "Bursa Büyükşehir Belediyesi (CBS)",
    sourceUrl: `${PORTAL}/toplanma-alanlari`,
    upstream: `${BAPI}/bbbAcikVeri_Cbs/Toplanma_yerleri`,
    refresh: "Günde bir",
    ttlMs: 24 * 60 * MIN,
    live: false,
    kind: "geojson",
    load: loadAssembly,
  },
  {
    id: "ilce-sinirlari",
    title: "İlçe Sınırları",
    description: "Bursa'nın 17 ilçesinin idari sınırları.",
    publisher: "Bursa Büyükşehir Belediyesi (CBS)",
    sourceUrl: `${PORTAL}/ilce-sinirlari`,
    upstream: `${BAPI}/bbbAcikVeri_Cbs/ILCE`,
    refresh: "Günde bir",
    ttlMs: 24 * 60 * MIN,
    live: false,
    kind: "geojson",
    load: loadDistricts,
  },
  {
    id: "parklar",
    title: "Parklar ve Kent Ormanları",
    description: "Öne çıkan park, kent ormanı ve rekreasyon alanları; adres ve kısa açıklamayla.",
    publisher: "Bursa Büyükşehir Belediyesi",
    sourceUrl: `${PORTAL}/parklar`,
    upstream: `${BAPI}/acik_veri_turizm/parklar`,
    refresh: "Günde bir",
    ttlMs: 24 * 60 * MIN,
    live: false,
    kind: "geojson",
    load: loadParks,
  },
  {
    id: "wifi-noktalari",
    title: "Ücretsiz Wi-Fi Noktaları",
    description: "Belediyenin ücretsiz internet sunduğu noktalar.",
    publisher: "Bursa Büyükşehir Belediyesi",
    sourceUrl: `${PORTAL}/wifi-noktalari`,
    upstream: `${BAPI}/acikveri/mobil_kesfet_acikveri/179`,
    refresh: "Günde bir",
    ttlMs: 24 * 60 * MIN,
    live: false,
    kind: "geojson",
    load: loadWifi,
  },
];

export function isDatasetId(id: string): id is DatasetId {
  return DATASETS.some((d) => d.id === id);
}

export function getDataset(id: "depremler"): Promise<FeatureCollection<QuakeProps>>;
export function getDataset(id: "hava-kalitesi"): Promise<FeatureCollection<AirProps>>;
export function getDataset(id: "baraj-doluluk"): Promise<DamData>;
export function getDataset(id: "hal-fiyatlari"): Promise<MarketRow[]>;
export function getDataset(id: "etkinlikler"): Promise<EventRow[]>;
export function getDataset(id: "ilce-sinirlari"): ReturnType<typeof loadDistricts>;
export function getDataset(id: "toplanma-alanlari"): ReturnType<typeof loadAssembly>;
export function getDataset(id: "parklar"): ReturnType<typeof loadParks>;
export function getDataset(id: "wifi-noktalari"): ReturnType<typeof loadWifi>;
export function getDataset(id: DatasetId): Promise<unknown>;
export function getDataset(id: DatasetId): Promise<unknown> {
  const meta = DATASETS.find((d) => d.id === id)!;
  return cached(id, meta.ttlMs, meta.load);
}

export function recordCount(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === "object") {
    if ("features" in data) return (data as FeatureCollection).features.length;
    if ("series" in data) return (data as DamData).series.length;
  }
  return 0;
}

export async function catalog() {
  return Promise.all(
    DATASETS.map(async ({ load, ...meta }) => {
      void load;
      let count: number | null = null;
      try {
        count = recordCount(await getDataset(meta.id));
      } catch {
        // hata bilgisi cacheInfo üzerinden döner
      }
      const info = cacheInfo(meta.id);
      return {
        ...meta,
        count,
        fetchedAt: info.fetchedAt ? new Date(info.fetchedAt).toISOString() : null,
        error: info.error ?? null,
      };
    }),
  );
}

// ---------- CSV dışa aktarma ----------

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(data: unknown): string {
  let rows: Record<string, unknown>[] = [];
  if (Array.isArray(data)) rows = data;
  else if (data && typeof data === "object" && "features" in data) {
    rows = (data as FeatureCollection).features.map((f: Feature) => {
      const props = { ...(f.properties as Record<string, unknown>) };
      delete props.merkez;
      const [lon, lat] = centroid(f.geometry);
      return { ...props, enlem: lat.toFixed(6), boylam: lon.toFixed(6) };
    });
  } else if (data && typeof data === "object" && "series" in data) {
    rows = (data as DamData).series.map((s) => ({ tarih: s.date, doluluk_yuzde: s.percent }));
  }
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  // Excel'in Türkçe karakterleri doğru açması için BOM ekleniyor.
  return "﻿" + [headers.join(","), ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(","))].join("\n");
}
