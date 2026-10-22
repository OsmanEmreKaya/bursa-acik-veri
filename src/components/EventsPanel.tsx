"use client";

import { useMemo, useState } from "react";
import { useDataset } from "@/lib/client-data";
import type { EventRow } from "@/lib/datasets";
import { Icon } from "./Icons";

const DAY = 864e5;
const parse = (s: string) => new Date(s.replace(" ", "T"));
const fmt = (d: Date) => d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });

function dateRange(start: Date, end: Date) {
  return start.toDateString() === end.toDateString() ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

function EventItem({ e, now }: { e: EventRow; now: number }) {
  const start = parse(e.baslangic);
  const end = parse(e.bitis);
  const ongoing = start.getTime() <= now;
  const daysLeft = Math.ceil((end.getTime() - now) / DAY);
  const daysToStart = Math.ceil((start.getTime() - now) / DAY);
  const note = ongoing
    ? daysLeft <= 1 ? "Son gün" : daysLeft <= 7 ? `${daysLeft} gün kaldı` : null
    : daysToStart <= 1 ? "Yarın başlıyor" : daysToStart <= 7 ? `${daysToStart} gün sonra` : null;

  return (
    <article className="flex gap-3 rounded-2xl border border-line bg-card p-2.5 transition hover:border-accent/30 hover:shadow-md hover:shadow-ink/5">
      {e.gorsel && (
        // Görseller belediyenin sunucusundan gelir; Next.js görsel optimizasyonu için alan adı tanımlı değil.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.gorsel} alt="" loading="lazy" className="h-20 w-20 flex-none rounded-xl object-cover ring-1 ring-line" />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <span className="rounded-full bg-base px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-dim">{e.kategori}</span>
          {note && <span className="whitespace-nowrap text-[11px] font-semibold text-accent">{note}</span>}
        </div>
        <h3 className="mt-1 text-sm font-semibold leading-snug text-ink">
          {e.link ? (
            <a href={e.link} target="_blank" rel="noreferrer" className="hover:text-accent hover:underline">
              {e.ad}
            </a>
          ) : (
            e.ad
          )}
        </h3>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-dim">
          <Icon name="calendar" className="h-3.5 w-3.5 flex-none text-faint" />
          {dateRange(start, end)}
        </p>
        {e.mekan && (
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-faint">
            <Icon name="pin" className="h-3.5 w-3.5 flex-none" />
            <span className="truncate">{e.mekan}</span>
          </p>
        )}
      </div>
    </article>
  );
}

export default function EventsPanel() {
  const { data, error, updatedAt } = useDataset<EventRow[]>("etkinlikler");
  const [cat, setCat] = useState("Tümü");
  // Gruplama verinin tarayıcıda yüklendiği ana göre yapılır. Render sırasında Date.now() okumak,
  // Cache Components açıkken sayfa önceden oluşturulurken değerlendirildiği için hata verir.
  const now = updatedAt?.getTime() ?? 0;

  const cats = useMemo(() => ["Tümü", ...new Set((data ?? []).map((r) => r.kategori))], [data]);
  const { ongoing, upcoming } = useMemo(() => {
    const rows = (data ?? []).filter((r) => parse(r.bitis).getTime() >= now && (cat === "Tümü" || r.kategori === cat));
    return {
      // Devam edenlerde bitişi yakın olan, yaklaşanlarda en erken başlayan öne gelir.
      ongoing: rows.filter((r) => parse(r.baslangic).getTime() <= now).sort((a, b) => parse(a.bitis).getTime() - parse(b.bitis).getTime()),
      upcoming: rows.filter((r) => parse(r.baslangic).getTime() > now).sort((a, b) => parse(a.baslangic).getTime() - parse(b.baslangic).getTime()),
    };
  }, [data, cat, now]);

  return (
    <div className="h-full overflow-y-auto px-4 pb-6 pt-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-ink">Güncel etkinlikler</h2>
        <span className="text-[11px] text-faint">Bursa Büyükşehir Belediyesi</span>
      </div>

      {cats.length > 2 && (
        <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition ${cat === c ? "bg-accent text-white" : "border border-line bg-card text-dim hover:border-accent/40 hover:text-accent"}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="mt-4 text-sm text-faint">Etkinlikler yükleniyor…</p>}
      {data && !ongoing.length && !upcoming.length && <p className="mt-4 text-sm text-faint">Bu kategoride listelenen etkinlik yok.</p>}

      {[
        { title: "Devam ediyor", rows: ongoing },
        { title: "Yaklaşan", rows: upcoming },
      ].map(
        (g) =>
          g.rows.length > 0 && (
            <section key={g.title} className="mt-5">
              <h3 className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-faint">
                {g.title}
                <span className="font-normal normal-case tracking-normal">· {g.rows.length}</span>
              </h3>
              <div className="space-y-2">
                {g.rows.map((e) => (
                  <EventItem key={e.id} e={e} now={now} />
                ))}
              </div>
            </section>
          ),
      )}
    </div>
  );
}
