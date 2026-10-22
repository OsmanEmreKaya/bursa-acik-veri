# Bursa Açık Veri Platformu

Bursa'nın **canlı açık verilerini** tek bir yerde toplayan, **harita** üzerinde gösteren ve **yapay zekâ asistanı** ile doğal dilde sorgulanabilen bir açık veri platformu.

> "Son bir haftada Bursa'da deprem oldu mu?", "Halde domates kaç lira?", "Altınşehir'e en yakın toplanma alanı nerede?"
> Asistan ilgili veri setini sorgular, yanıtı yazar ve sonucu haritada işaretler.

## Özellikler

- **Canlı harita**: Depremler, ilçe bazında hava kalitesi, afet toplanma alanları, parklar, ücretsiz Wi-Fi noktaları ve ilçe sınırları ayrı katmanlar olarak açılıp kapatılabilir. Canlı katmanlar 5 dakikada bir kendiliğinden yenilenir.
- **LLM asistanı (tool calling)**: Model, soruyu yanıtlamak için platformun araçlarını çağırır (`deprem_sorgula`, `hal_fiyati`, `en_yakin_bul` vb.). Araçlar hem veriyi döndürür hem de haritaya ne yapılacağını söyler: yakınlaştırma, vurgulama, işaretçi koyma, panel açma. Model sayı uydurmaz; her yanıt gerçek veriye dayanır.
- **Değiştirilebilir LLM katmanı**: Tek bir ortam değişkeniyle Gemini, Groq, Ollama (yerel), OpenAI veya Claude arasında geçiş yapılır. Varsayılan sağlayıcı, ücretsiz katmanı olan Gemini'dir.
- **Göstergeler**: Baraj doluluk oranı (12 aylık grafik), günlük hal fiyatları (aranabilir tablo) ve güncel etkinlikler.
- **Veri kataloğu**: Her veri setinin kaynağı, güncellenme sıklığı, kayıt sayısı ve son çekim zamanı tek sayfada görünür. Her set JSON veya CSV olarak indirilebilir ve REST API üzerinden kullanılabilir.
- **Mobil uyumlu** arayüz, Türkçe karakter duyarsız arama (`nilufer` → Nilüfer).

## Veri kaynakları

| Veri seti | Kaynak | Güncelleme |
|---|---|---|
| Depremler (son 30 gün; Bursa içi + Bursa'da hissedilebilecek çevre depremleri) | AFAD Deprem API | 5 dk (canlı) |
| Hava kalitesi + hava durumu (17 ilçe) | Open-Meteo (CAMS/ECMWF) | 30 dk (canlı) |
| Baraj doluluk oranı + 2021'den bugüne seri | BUSKİ / Bursa Büyükşehir | Günlük |
| Hal fiyatları | Bursa Büyükşehir Belediyesi | Günlük |
| Etkinlikler | Bursa Büyükşehir Belediyesi | Saatlik |
| Afet toplanma alanları (1.206 alan) | Bursa BB CBS | Statik |
| İlçe sınırları, Wi-Fi noktaları | Bursa BB Açık Veri Portalı | Statik |
| Parklar (belediyenin öne çıkanları + diğer parklar) | Bursa BB turizm kataloğu + OpenStreetMap | Belediye: günlük · OSM: kayıtlı veri |

Bursa Büyükşehir verileri [acikyesil.bursa.bel.tr](https://acikyesil.bursa.bel.tr) portalındaki API'lerden çekilir. Hiçbir kaynak API anahtarı gerektirmez.

Belediyenin park veri seti yalnızca turizm kataloğundaki öne çıkan parkları içerdiği için parklar katmanı bunları OpenStreetMap'teki diğer parklarla birleştirir. OSM verisi Overpass API'den bir kez çekilip `src/data/osm-parks.json` olarak saklanır; Overpass sunucuları zaman zaman yanıt vermediğinden canlı çekilmez. Yenilemek için `npm run veri:parklar` çalıştırın. Park verisi © OpenStreetMap katkıcıları, [ODbL](https://www.openstreetmap.org/copyright).

## Mimari

```
Tarayıcı (Next.js + MapLibre)
  │   harita katmanları  ── GET /api/data/:id ──┐
  │   sohbet            ── POST /api/chat ──────┤
  ▼                                             ▼
Next.js Route Handlers ──► LLM katmanı (Gemini / Groq / Ollama / OpenAI / Claude)
  │                              │  araç çağrısı
  │                              ▼
  └──────────────► Araçlar (src/lib/tools.ts) ──► Veri katmanı (src/lib/datasets.ts)
                                                      │  TTL önbelleği
                                                      ▼
                                        AFAD · Open-Meteo · Bursa BB API'leri
```

- **Veri katmanı** (`src/lib/datasets.ts`): Her kaynak için bir yükleyici. Ham veri temizlenir ve standart GeoJSON veya tabloya dönüştürülür. Sonuç, veri setine özel süreyle (TTL) bellekte tutulur. Kaynak geçici olarak çökerse son başarılı veri sunulmaya devam eder.
- **Araçlar** (`src/lib/tools.ts`): LLM'in çağırabileceği fonksiyonlar. Her araç JSON Schema ile tanımlanır ve `{ result, actions }` döndürür. `result` modele gider, `actions` ise haritaya uygulanır.
- **LLM katmanı** (`src/lib/llm/`): Her sağlayıcı kendi yerel mesaj biçimiyle araç döngüsünü yürütür ve dışarıya tek bir `run()` arayüzü sunar. Yeni bir sağlayıcı eklemek tek bir dosya yazmak demektir.

## Kurulum

Gereksinimler: Node.js 20+

```bash
npm install
cp .env.example .env.local
```

**Ücretsiz Gemini anahtarı:** [Google AI Studio](https://aistudio.google.com/apikey) üzerinden bir API anahtarı oluşturun ve `.env.local` içindeki `GEMINI_API_KEY` alanına yapıştırın. Kredi kartı gerekmez.

```bash
npm run dev
```

Uygulama http://localhost:3000 adresinde açılır. Harita, katmanlar, göstergeler ve veri kataloğu anahtar olmadan da çalışır; anahtar yalnızca asistan için gereklidir.

### LLM sağlayıcısını değiştirmek

`.env.local` içinde:

| Sağlayıcı | Ayar | Not |
|---|---|---|
| Gemini (varsayılan) | `LLM_PROVIDER=gemini` + `GEMINI_API_KEY` | Ücretsiz katman |
| Groq | `LLM_PROVIDER=groq` + `GROQ_API_KEY` | Ücretsiz katman, çok hızlı |
| Ollama | `LLM_PROVIDER=ollama` | Tamamen yerel ve ücretsiz; tool calling destekleyen bir model gerekir (ör. `qwen3:8b`) |
| OpenAI | `LLM_PROVIDER=openai` + `OPENAI_API_KEY` | Ücretli |
| Claude | `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` | Ücretli |

Model adı `LLM_MODEL` ile değiştirilebilir. Gemini modeli yoğun olduğunda (503) asistan otomatik olarak `LLM_FALLBACK_MODEL` modeline geçer (varsayılan: `gemini-flash-lite-latest`). Değişiklikten sonra sunucuyu yeniden başlatın.

## API

| Uç nokta | Açıklama |
|---|---|
| `GET /api/datasets` | Veri kataloğu: kaynak, kayıt sayısı, son çekim zamanı, hata durumu |
| `GET /api/data/:id` | Veri setinin kendisi (GeoJSON veya JSON) |
| `GET /api/data/:id?format=csv` | CSV olarak indirme (Excel uyumlu) |
| `POST /api/chat` | `{ messages, context }` alır; `{ reply, actions, trace }` döndürür |

`:id` değerleri: `depremler`, `hava-kalitesi`, `baraj-doluluk`, `hal-fiyatlari`, `etkinlikler`, `toplanma-alanlari`, `ilce-sinirlari`, `parklar`, `wifi-noktalari`

## Proje yapısı

```
src/
  app/
    page.tsx                 Harita + asistan ana ekranı
    veri-setleri/page.tsx    Veri kataloğu
    api/data/[id]/route.ts   Veri seti uç noktası (JSON/CSV)
    api/datasets/route.ts    Katalog uç noktası
    api/chat/route.ts        LLM asistanı
  components/                MapView, ChatPanel, LayerPanel, InfoCards, StatStrip…
  lib/
    datasets.ts              Kaynak yükleyicileri + katalog
    tools.ts                 LLM araçları
    llm/                     Sağlayıcıdan bağımsız LLM katmanı
    cache.ts, geo.ts         Önbellek ve coğrafi yardımcılar
```

## Teknik notlar

- AFAD API'si saatleri **UTC** olarak verir (Kandilli kayıtlarıyla karşılaştırılarak doğrulandı). Arayüzde Türkiye saatine çevrilir.
- Baraj serisinde 2025 sonbaharında görülen %0 değerleri, kullanılabilir suyun tükendiğini (ölü hacim seviyesi) ya da o gün ölçüm girilmediğini gösterebilir. Veri olduğu gibi sunulur ve arayüzde bu not belirtilir.
- Hava kalitesi, ilçe sınırlarının alan ağırlıklı merkezleri için Open-Meteo'dan tek istekte çekilir.
- Gemini'nin ücretsiz katmanında dakikalık ve günlük istek limitleri vardır; tek bir soru, araç çağrılarıyla birlikte 2–3 istek harcar. Ücretsiz katmanda Google girdileri model geliştirmek için kullanabilir.
- MapLibre GL v6 harita işlemlerini ayrı bir worker'da yapar. `npm install` sonrasında worker dosyası `public/` klasörüne otomatik kopyalanır.

## Geliştirme fikirleri

- Veri geçmişini saklamak (ör. SQLite/PostGIS) ve zaman içindeki değişimi göstermek
- Yanıtları akış (streaming) olarak göstermek
- Deprem bildirimleri (belirli bir büyüklüğün üzerinde)
- İBB benzeri trafik ve toplu taşıma verileri yayınlandığında yeni katmanlar eklemek
