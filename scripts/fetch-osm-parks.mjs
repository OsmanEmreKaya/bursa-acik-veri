// Bursa ilindeki parkları (leisure=park) OpenStreetMap'ten çekip src/data/osm-parks.json olarak kaydeder.
// Overpass sunucuları zaman zaman yanıt vermediği için uygulama bu veriyi canlı çekmez; parklar sık
// değişmediğinden bu betiği arada bir çalıştırmak yeterli:  npm run veri:parklar
// Veri © OpenStreetMap katkıcıları, ODbL lisansı (https://www.openstreetmap.org/copyright).
import { mkdirSync, writeFileSync } from "node:fs";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
// İl sınırı (area) sorgusu sunucuyu zorladığı için Bursa'yı kapsayan bir kutu kullanılır;
// kutuya giren komşu il parkları uygulamada ilçe sınırlarıyla elenir.
const QUERY = `[out:json][timeout:90];
nwr["leisure"="park"](39.55,27.95,40.75,30.15);
out center tags;`;

async function overpass() {
  const errors = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const url of ENDPOINTS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          body: new URLSearchParams({ data: QUERY }),
          headers: { "User-Agent": "bursa-acik-veri/1.0" },
          signal: AbortSignal.timeout(120_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        // Sunucu tarafında zaman aşımı olursa Overpass boş liste ve bir "remark" döndürür; bu bir başarı değildir.
        if (json.remark || !json.elements?.length) throw new Error(json.remark || "boş yanıt");
        return json;
      } catch (e) {
        errors.push(`${new URL(url).host} (deneme ${attempt}): ${e.message}`);
        console.warn(errors.at(-1));
      }
    }
    await new Promise((r) => setTimeout(r, 15_000 * attempt));
  }
  throw new Error(`Overpass'a ulaşılamadı:\n${errors.join("\n")}`);
}

const round = (n) => Math.round(n * 1e5) / 1e5;
const data = await overpass();
const parks = data.elements
  .map((e) => {
    const c = e.type === "node" ? [e.lon, e.lat] : e.center && [e.center.lon, e.center.lat];
    return c && { osm: `${e.type}/${e.id}`, ad: e.tags?.name?.trim() || null, c: [round(c[0]), round(c[1])] };
  })
  .filter(Boolean)
  .sort((a, b) => a.osm.localeCompare(b.osm));

mkdirSync("src/data", { recursive: true });
writeFileSync(
  "src/data/osm-parks.json",
  JSON.stringify({ kaynak: "© OpenStreetMap katkıcıları (ODbL)", cekim: new Date().toISOString(), parklar: parks }) + "\n",
);
console.log(`${parks.length} park kaydedildi (${parks.filter((p) => p.ad).length} tanesinin adı var) → src/data/osm-parks.json`);
