export type LngLat = [number, number];

type Geometry =
  | { type: "Point"; coordinates: number[] }
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

export type Feature<P = Record<string, unknown>> = {
  type: "Feature";
  id?: string | number;
  geometry: Geometry;
  properties: P;
};

export type FeatureCollection<P = Record<string, unknown>> = {
  type: "FeatureCollection";
  features: Feature<P>[];
};

export const BURSA_CENTER: LngLat = [29.06, 40.19];

/** İki nokta arası mesafe (km). */
export function haversineKm(a: LngLat, b: LngLat): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function outerRings(geometry: Geometry): number[][][] {
  if (geometry.type === "Point") return [[geometry.coordinates]];
  if (geometry.type === "Polygon") return [geometry.coordinates[0]];
  return geometry.coordinates.map((poly) => poly[0]);
}

/** Nokta, alanın dış halkalarından birinin içinde mi (ışın yöntemi). */
export function containsPoint(geometry: Geometry, [x, y]: LngLat): boolean {
  if (geometry.type === "Point") return false;
  return outerRings(geometry).some((ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  });
}

/** Noktanın alanların sınırına en kısa uzaklığı (km); sınır köşelerine olan uzaklıkla yaklaşık hesaplanır. */
export function distanceToEdgeKm(geometries: Geometry[], p: LngLat): number {
  let best = Infinity;
  for (const g of geometries)
    for (const ring of outerRings(g))
      for (const v of ring) best = Math.min(best, haversineKm(p, [v[0], v[1]]));
  return best;
}

/** Alan ağırlıklı merkez (en büyük halka). Nokta için noktanın kendisi. */
export function centroid(geometry: Geometry): LngLat {
  if (geometry.type === "Point") return [geometry.coordinates[0], geometry.coordinates[1]];
  let best: { area: number; c: LngLat } = { area: -1, c: [0, 0] };
  for (const ring of outerRings(geometry)) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      a += f;
      cx += (ring[j][0] + ring[i][0]) * f;
      cy += (ring[j][1] + ring[i][1]) * f;
    }
    if (Math.abs(a) > best.area) best = { area: Math.abs(a), c: [cx / (3 * a), cy / (3 * a)] };
  }
  return best.c;
}

export function bbox(geometry: Geometry): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of outerRings(geometry))
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  return [minX, minY, maxX, maxY];
}

/** Koordinatları 5 ondalığa yuvarlar (~1 m); GeoJSON boyutunu ciddi küçültür. */
export function roundCoords<G extends Geometry>(geometry: G): G {
  const r = (n: number) => Math.round(n * 1e5) / 1e5;
  const walk = (v: unknown): unknown => (Array.isArray(v) ? v.map(walk) : typeof v === "number" ? r(v) : v);
  return { ...geometry, coordinates: walk(geometry.coordinates) } as G;
}

/** Türkçe karakterleri ve büyük/küçük harfi yok sayarak karşılaştırma için normalleştirir. */
export function normalizeTr(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleCaseTr(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .split(" ")
    .map((w) => (w ? w[0].toLocaleUpperCase("tr-TR") + w.slice(1) : w))
    .join(" ");
}
