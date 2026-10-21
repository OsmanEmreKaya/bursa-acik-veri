import { catalog, getDataset } from "./datasets";
import { bbox, haversineKm, type LngLat, normalizeTr, titleCaseTr } from "./geo";
import type { LayerId, MapAction } from "./map-actions";

export type ToolContext = { userLocation?: LngLat; mapCenter?: LngLat };
type ToolResult = { result: unknown; actions?: MapAction[] };

export type Tool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
};

const trTime = (iso: string) =>
  new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" });

function boundsOf(points: LngLat[], pad = 0.05): [number, number, number, number] {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
}

async function findDistrict(name: string) {
  const districts = await getDataset("ilce-sinirlari");
  const n = normalizeTr(name);
  return districts.features.find((f) => normalizeTr(f.properties.ad) === n) ??
    districts.features.find((f) => normalizeTr(f.properties.ad).includes(n) || n.includes(normalizeTr(f.properties.ad)));
}

function aqiLabel(aqi: number | null): string {
  if (aqi === null) return "bilinmiyor";
  if (aqi <= 20) return "çok iyi";
  if (aqi <= 40) return "iyi";
  if (aqi <= 60) return "orta";
  if (aqi <= 80) return "kötü";
  if (aqi <= 100) return "çok kötü";
  return "son derece kötü";
}

const WEATHER: Record<number, string> = {
  0: "açık", 1: "çoğunlukla açık", 2: "parçalı bulutlu", 3: "kapalı", 45: "sisli", 48: "kırağılı sis",
  51: "hafif çisenti", 53: "çisenti", 55: "yoğun çisenti", 61: "hafif yağmur", 63: "yağmur", 65: "kuvvetli yağmur",
  71: "hafif kar", 73: "kar", 75: "yoğun kar", 80: "sağanak", 81: "kuvvetli sağanak", 82: "şiddetli sağanak",
  95: "gök gürültülü fırtına", 96: "dolu ile fırtına", 99: "şiddetli dolu",
};

export const TOOLS: Tool[] = [
  {
    name: "deprem_sorgula",
    description:
      "AFAD verisinden Bursa ve çevresindeki son depremleri getirir (en fazla son 30 gün). Sonuçları haritada işaretler.",
    parameters: {
      type: "object",
      properties: {
        gun: { type: "integer", description: "Kaç gün geriye bakılacak (1-30). Varsayılan 7." },
        min_buyukluk: { type: "number", description: "En düşük büyüklük. Varsayılan 0." },
        ilce: { type: "string", description: "İsteğe bağlı ilçe adı filtresi, ör. 'Mustafakemalpaşa'." },
        sadece_bursa: { type: "boolean", description: "true ise sadece Bursa il sınırları içindekiler. Varsayılan false." },
      },
    },
    async run(args) {
      const gun = Math.min(30, Math.max(1, Number(args.gun ?? 7)));
      const minMag = Number(args.min_buyukluk ?? 0);
      const since = Date.now() - gun * 24 * 3600 * 1000;
      const ilce = args.ilce ? normalizeTr(String(args.ilce)) : null;
      const data = await getDataset("depremler");
      const hits = data.features.filter((f) => {
        const p = f.properties;
        return (
          new Date(p.time).getTime() >= since &&
          p.mag >= minMag &&
          (!args.sadece_bursa || normalizeTr(p.province) === "bursa") &&
          (!ilce || normalizeTr(p.district).includes(ilce))
        );
      });
      const sorted = [...hits].sort((a, b) => b.properties.mag - a.properties.mag);
      const actions: MapAction[] = [{ type: "showLayer", layer: "depremler" }];
      if (hits.length) {
        actions.push({ type: "highlight", layer: "depremler", ids: hits.map((f) => Number(f.id)) });
        actions.push({ type: "fitBounds", bounds: boundsOf(hits.map((f) => f.geometry.coordinates as LngLat), 0.15) });
      }
      return {
        result: {
          kaynak: "AFAD Deprem Dairesi",
          kriter: { gun, min_buyukluk: minMag, ilce: args.ilce ?? null },
          toplam: hits.length,
          en_buyuk: sorted[0]
            ? { buyukluk: sorted[0].properties.mag, yer: sorted[0].properties.place, zaman: trTime(sorted[0].properties.time) }
            : null,
          depremler: sorted.slice(0, 15).map((f) => ({
            buyukluk: f.properties.mag,
            derinlik_km: f.properties.depth,
            yer: f.properties.place,
            zaman: trTime(f.properties.time),
          })),
          not: hits.length > 15 ? `Büyüklüğe göre ilk 15 gösteriliyor (toplam ${hits.length}).` : undefined,
        },
        actions,
      };
    },
  },
  {
    name: "hava_kalitesi_ve_durumu",
    description:
      "Bursa ilçeleri için anlık hava kalitesi (Avrupa AQI, PM2.5, PM10, NO2, O3) ve hava durumu (sıcaklık, nem, rüzgar). İlçe verilmezse tüm ilçeleri en kötüden iyiye sıralar.",
    parameters: {
      type: "object",
      properties: { ilce: { type: "string", description: "İsteğe bağlı ilçe adı, ör. 'Nilüfer'." } },
    },
    async run(args) {
      const data = await getDataset("hava-kalitesi");
      let rows = data.features;
      const actions: MapAction[] = [{ type: "showLayer", layer: "hava-kalitesi" }];
      if (args.ilce) {
        const n = normalizeTr(String(args.ilce));
        rows = rows.filter((f) => normalizeTr(f.properties.ilce).includes(n));
        if (!rows.length) return { result: { hata: `'${args.ilce}' adında bir ilçe bulunamadı.` } };
        actions.push({ type: "flyTo", center: rows[0].geometry.coordinates as LngLat, zoom: 11 });
        actions.push({ type: "highlight", layer: "hava-kalitesi", ids: rows.map((f) => Number(f.id)) });
      }
      const out = rows
        .map((f) => f.properties)
        .sort((a, b) => (b.aqi ?? 0) - (a.aqi ?? 0))
        .map((p) => ({
          ilce: p.ilce,
          aqi: p.aqi,
          durum: aqiLabel(p.aqi),
          pm2_5: p.pm2_5,
          pm10: p.pm10,
          no2: p.no2,
          o3: p.o3,
          sicaklik_c: p.temperature,
          nem_yuzde: p.humidity,
          ruzgar_kmh: p.wind,
          hava: p.weatherCode !== null ? (WEATHER[p.weatherCode] ?? `kod ${p.weatherCode}`) : null,
          olcum_saati: p.time,
        }));
      return {
        result: { kaynak: "Open-Meteo (Copernicus CAMS modeli)", birimler: "PM ve gazlar µg/m³; Avrupa AQI 0-100+ (düşük = iyi)", ilceler: out },
        actions,
      };
    },
  },
  {
    name: "baraj_doluluk",
    description:
      "BUSKİ verisinden Bursa geneli baraj doluluk oranını, son 7/30 gündeki değişimi ve geçen yılın aynı günüyle karşılaştırmayı getirir.",
    parameters: { type: "object", properties: {} },
    async run() {
      const { current, series } = await getDataset("baraj-doluluk");
      const byDate = new Map(series.map((s) => [s.date, s.percent]));
      const shift = (days: number) => {
        const d = new Date(`${current.date}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - days);
        const key = d.toISOString().slice(0, 10);
        return byDate.get(key) ?? null;
      };
      const lastYear = series.filter((s) => s.date > shiftDate(current.date, -365));
      const minY = lastYear.reduce((a, b) => (b.percent < a.percent ? b : a), lastYear[0]);
      const maxY = lastYear.reduce((a, b) => (b.percent > a.percent ? b : a), lastYear[0]);
      const d7 = shift(7), d30 = shift(30), y1 = shift(365);
      return {
        result: {
          kaynak: "BUSKİ / Bursa Büyükşehir Belediyesi Açık Veri",
          tarih: current.date,
          doluluk_yuzde: current.percent,
          kalan_su_m3: current.remainingM3,
          kapasite_m3: current.capacityM3,
          yedi_gun_once: d7,
          otuz_gun_once: d30,
          gecen_yil_ayni_gun: y1,
          fark_gecen_yila_gore_puan: y1 !== null ? Math.round((current.percent - y1) * 10) / 10 : null,
          son_bir_yil_en_dusuk: minY,
          son_bir_yil_en_yuksek: maxY,
          not: "0 değeri kullanılabilir suyun tükendiği (ölü hacim seviyesi) ya da o gün ölçüm girilmediği anlamına gelebilir.",
        },
        actions: [{ type: "openPanel", panel: "baraj" }],
      };
    },
  },
  {
    name: "hal_fiyati",
    description:
      "Bursa toptancı halinin bugünkü meyve, sebze ve balık fiyatlarını (TL, en düşük-en yüksek) getirir. Ürün veya kategoriye göre filtrelenebilir.",
    parameters: {
      type: "object",
      properties: {
        urun: { type: "string", description: "Ürün adı ya da bir kısmı, ör. 'domates', 'hamsi'." },
        kategori: { type: "string", description: "Meyve, Sebze, İthal, Dip Su Ürünleri, Pelajik Su Ürünleri vb." },
      },
    },
    async run(args) {
      const rows = await getDataset("hal-fiyatlari");
      const u = args.urun ? normalizeTr(String(args.urun)) : null;
      const k = args.kategori ? normalizeTr(String(args.kategori)) : null;
      const hits = rows.filter(
        (r) => (!u || normalizeTr(r.urun).includes(u)) && (!k || normalizeTr(r.kategori).includes(k)),
      );
      return {
        result: {
          kaynak: "Bursa Büyükşehir Belediyesi Açık Veri (hal fiyatları)",
          tarih: rows[0]?.tarih ?? null,
          toplam_urun: rows.length,
          eslesen: hits.length,
          fiyatlar: hits.slice(0, 30).map((r) => ({ urun: r.urun, kategori: r.kategori, min_tl: r.min, max_tl: r.max, birim: r.birim })),
          kategoriler: [...new Set(rows.map((r) => r.kategori))],
        },
        actions: [{ type: "openPanel", panel: "hal", query: args.urun ? String(args.urun) : undefined }],
      };
    },
  },
  {
    name: "en_yakin_bul",
    description:
      "Bir noktaya en yakın afet toplanma alanlarını, parkları veya ücretsiz Wi-Fi noktalarını bulur ve haritada gösterir. Konum olarak koordinat, ilçe veya mahalle verilebilir; hiçbiri verilmezse kullanıcının paylaştığı konum, o da yoksa harita merkezi kullanılır.",
    parameters: {
      type: "object",
      properties: {
        tur: { type: "string", enum: ["toplanma", "park", "wifi"], description: "Aranacak yer türü." },
        enlem: { type: "number" },
        boylam: { type: "number" },
        ilce: { type: "string", description: "İlçe adı; koordinat yoksa ilçe merkezi kullanılır." },
        mahalle: { type: "string", description: "Sadece toplanma alanları için mahalle adı filtresi." },
        adet: { type: "integer", description: "Kaç sonuç (1-10). Varsayılan 3." },
      },
      required: ["tur"],
    },
    async run(args, ctx) {
      const adet = Math.min(10, Math.max(1, Number(args.adet ?? 3)));
      let origin: LngLat | undefined;
      let originLabel = "";
      if (typeof args.enlem === "number" && typeof args.boylam === "number") {
        origin = [args.boylam, args.enlem];
        originLabel = "Verilen konum";
      } else if (args.ilce && !(args.tur === "toplanma" && args.mahalle)) {
        const d = await findDistrict(String(args.ilce));
        if (!d) return { result: { hata: `'${args.ilce}' adında bir ilçe bulunamadı.` } };
        origin = d.properties.merkez;
        originLabel = `${d.properties.ad} merkezi`;
      } else if (ctx.userLocation) {
        origin = ctx.userLocation;
        originLabel = "Konumunuz";
      } else if (ctx.mapCenter) {
        origin = ctx.mapCenter;
        originLabel = "Harita merkezi";
      }
      if (!origin && !args.mahalle) return { result: { hata: "Konum belirlenemedi; ilçe, mahalle ya da konum paylaşımı gerekli." } };

      type Item = { id: number; ad: string; detay: string; c: LngLat };
      let layer: LayerId;
      let items: Item[];
      if (args.tur === "toplanma") {
        layer = "toplanma-alanlari";
        const data = await getDataset("toplanma-alanlari");
        const m = args.mahalle ? normalizeTr(String(args.mahalle)) : null;
        const i = args.ilce ? normalizeTr(String(args.ilce)) : null;
        items = data.features
          .filter((f) => (!m || normalizeTr(f.properties.mahalle).includes(m)) && (!i || normalizeTr(f.properties.ilce).includes(i)))
          .map((f) => ({ id: Number(f.id), ad: f.properties.ad, detay: `${f.properties.mahalle}, ${f.properties.ilce}`, c: f.properties.merkez }));
        // Mahalle verildiyse başlangıç noktası mahalledeki alanların ortalama merkezidir.
        if (!origin && items.length) {
          origin = [
            items.reduce((a, it) => a + it.c[0], 0) / items.length,
            items.reduce((a, it) => a + it.c[1], 0) / items.length,
          ];
          originLabel = `${titleCaseTr(String(args.mahalle))} mahallesi merkezi`;
        }
      } else if (args.tur === "park") {
        layer = "parklar";
        const data = await getDataset("parklar");
        items = data.features.map((f) => ({ id: Number(f.id), ad: f.properties.ad, detay: f.properties.adres, c: f.geometry.coordinates as LngLat }));
      } else {
        layer = "wifi-noktalari";
        const data = await getDataset("wifi-noktalari");
        items = data.features.map((f) => ({ id: Number(f.id), ad: f.properties.ad, detay: "Ücretsiz Wi-Fi", c: f.geometry.coordinates as LngLat }));
      }
      if (!items.length || !origin) return { result: { hata: "Bu kritere uyan yer bulunamadı." } };

      const o = origin;
      const nearest = items
        .map((it) => ({ ...it, km: haversineKm(o, it.c) }))
        .sort((a, b) => a.km - b.km)
        .slice(0, adet);
      return {
        result: {
          kaynak: "Bursa Büyükşehir Belediyesi Açık Veri",
          baslangic: originLabel,
          sonuclar: nearest.map((n) => ({
            ad: n.ad,
            detay: n.detay,
            mesafe_km: Math.round(n.km * 100) / 100,
            enlem: n.c[1].toFixed(5),
            boylam: n.c[0].toFixed(5),
          })),
          not: "Mesafeler kuş uçuşudur.",
        },
        actions: [
          { type: "showLayer", layer },
          { type: "highlight", layer, ids: nearest.map((n) => n.id) },
          { type: "marker", center: o, label: originLabel },
          { type: "fitBounds", bounds: boundsOf([o, ...nearest.map((n) => n.c)], 0.01) },
        ],
      };
    },
  },
  {
    name: "ilceye_git",
    description: "Haritayı bir ilçeye yakınlaştırır ve ilçe sınırını vurgular.",
    parameters: {
      type: "object",
      properties: { ilce: { type: "string" } },
      required: ["ilce"],
    },
    async run(args) {
      const d = await findDistrict(String(args.ilce));
      if (!d) return { result: { hata: `'${args.ilce}' adında bir ilçe bulunamadı.` } };
      return {
        result: { ilce: d.properties.ad, merkez: d.properties.merkez },
        actions: [
          { type: "showLayer", layer: "ilce-sinirlari" },
          { type: "highlight", layer: "ilce-sinirlari", ids: [Number(d.id)] },
          { type: "fitBounds", bounds: bbox(d.geometry) },
        ],
      };
    },
  },
  {
    name: "etkinlikler",
    description: "Bursa Büyükşehir Belediyesi'nin duyurduğu güncel ve yaklaşan etkinlikleri listeler.",
    parameters: { type: "object", properties: {} },
    async run() {
      const rows = await getDataset("etkinlikler");
      const now = new Date().toISOString().slice(0, 10);
      const active = rows.filter((r) => r.bitis.slice(0, 10) >= now);
      return {
        result: {
          kaynak: "Bursa Büyükşehir Belediyesi",
          bugun: now,
          etkinlikler: active.map((r) => ({ ad: r.ad, baslangic: r.baslangic, bitis: r.bitis, kategori: r.kategori, mekan: r.mekan, link: r.link })),
        },
        actions: [{ type: "openPanel", panel: "etkinlik" }],
      };
    },
  },
  {
    name: "veri_setlerini_listele",
    description: "Platformdaki tüm veri setlerini, kaynaklarını, güncellenme sıklıklarını ve kayıt sayılarını listeler.",
    parameters: { type: "object", properties: {} },
    async run() {
      const list = await catalog();
      return {
        result: list.map((d) => ({
          id: d.id, ad: d.title, yayinci: d.publisher, guncelleme: d.refresh, canli: d.live, kayit: d.count, son_cekim: d.fetchedAt,
        })),
      };
    },
  },
];

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
