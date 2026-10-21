// MapLibre GL v6, harita verisini ayrı bir ES modül worker'ında işler. Paketleyici bu
// dosyayı otomatik kopyalamadığı için kurulumdan sonra public/ klasörüne taşıyoruz.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/package.json"));
mkdirSync("public", { recursive: true });
copyFileSync(join(dist, "dist", "maplibre-gl-worker.mjs"), join("public", "maplibre-gl-worker.mjs"));
console.log("maplibre-gl-worker.mjs -> public/");
