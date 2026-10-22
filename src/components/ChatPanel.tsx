"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import type { MapAction } from "@/lib/map-actions";
import { Icon, type IconName } from "./Icons";
import Markdown from "./Markdown";

type Msg = {
  role: "user" | "assistant";
  content: string;
  trace?: { tool: string; ok: boolean }[];
  error?: boolean;
};

const TOOL_LABELS: Record<string, string> = {
  deprem_sorgula: "Deprem verisi",
  hava_kalitesi_ve_durumu: "Hava kalitesi",
  baraj_doluluk: "Baraj doluluk",
  hal_fiyati: "Hal fiyatları",
  en_yakin_bul: "Yakın yer arama",
  ilceye_git: "İlçe sınırı",
  etkinlikler: "Etkinlikler",
  veri_setlerini_listele: "Veri kataloğu",
};

const SUGGESTIONS: { q: string; icon: IconName }[] = [
  { q: "Son bir haftada Bursa'da deprem oldu mu?", icon: "activity" },
  { q: "Bugün hava kalitesi en kötü ilçe hangisi?", icon: "wind" },
  { q: "Barajlar geçen yıla göre ne durumda?", icon: "droplet" },
  { q: "Halde domates kaç lira?", icon: "basket" },
  { q: "Altınşehir'e en yakın toplanma alanı nerede?", icon: "users" },
  { q: "Bu hafta hangi etkinlikler var?", icon: "calendar" },
];

type Props = {
  onActions: (actions: MapAction[]) => void;
  getContext: () => { userLocation?: [number, number]; mapCenter?: [number, number] };
  userLocation?: [number, number];
  onRequestLocation: () => void;
  locating: boolean;
  locationError?: string;
  onStatusChange?: (status: ChatStatus) => void;
};

export type ChatStatus = "idle" | "thinking" | "writing";

export default function ChatPanel({ onActions, getContext, userLocation, onRequestLocation, locating, locationError, onStatusChange }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Yanıt sunucudan tek parça gelir; ekranda kısa sürede yazılarak açılır. `shown` görünen karakter sayısı.
  const [typing, setTyping] = useState<{ index: number; shown: number } | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const status: ChatStatus = busy ? "thinking" : typing ? "writing" : "idle";
  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  useEffect(() => {
    if (!typing) return;
    const len = messages[typing.index]?.content.length ?? 0;
    // Uzun yanıtlar da en fazla ~2,5 saniyede tamamlansın.
    const step = Math.max(2, Math.ceil(len / 150));
    const id = setTimeout(() => setTyping((t) => (t && t.shown + step < len ? { ...t, shown: t.shown + step } : null)), 16);
    return () => clearTimeout(id);
  }, [typing, messages]);

  useEffect(() => {
    if (!messages.length) return;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: typing ? "auto" : "smooth" });
  }, [messages, busy, typing]);

  async function request(history: Msg[]) {
    setMessages(history);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.filter((m) => !m.error).map(({ role, content }) => ({ role, content })),
          context: getContext(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setModel(`${body.provider} · ${body.model}`);
      onActions(body.actions ?? []);
      setMessages([...history, { role: "assistant", content: body.reply || "(boş yanıt)", trace: body.trace }]);
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setTyping({ index: history.length, shown: 0 });
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: (e as Error).message, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    request([...messages, { role: "user", content: q }]);
  }

  // Son yanıt hata ise onu kaldırıp aynı soruyu yeniden gönderir.
  function retry() {
    if (!busy) request(messages.slice(0, -1));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-accent/10 text-accent">
                <Icon name="sparkle" className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-ink">Bursa hakkında bir şey sorun</h2>
                <p className="mt-0.5 text-[13px] leading-relaxed text-dim">
                  Asistan ilgili veriyi bulur, yanıtı yazar ve sonucu haritada gösterir.
                </p>
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-line bg-card">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.q}
                  onClick={() => send(s.q)}
                  className="group flex w-full items-center gap-3 border-b border-line px-3.5 py-2.5 text-left text-[13px] text-dim transition last:border-b-0 hover:bg-accent/5 hover:text-ink"
                >
                  <Icon name={s.icon} className="h-4 w-4 flex-none text-faint transition group-hover:text-accent" />
                  <span className="flex-1">{s.q}</span>
                  <Icon name="arrowRight" className="h-3.5 w-3.5 flex-none text-accent opacity-0 transition group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm leading-relaxed text-white shadow-sm">{m.content}</div>
            </div>
          ) : (
            <div key={i} className="flex flex-col items-start gap-1.5">
              {!!m.trace?.length && (
                <div className="flex flex-wrap gap-1">
                  {m.trace.map((t, j) => (
                    <span
                      key={j}
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${t.ok ? "bg-accent/10 text-accent" : "bg-red-50 text-red-700"}`}
                    >
                      <Icon name={t.ok ? "database" : "close"} className="h-3 w-3" />
                      {TOOL_LABELS[t.tool] ?? t.tool}
                    </span>
                  ))}
                </div>
              )}
              <div
                className={`max-w-[95%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm ${m.error ? "bg-red-50 text-red-800 ring-1 ring-red-200" : "bg-card text-ink shadow-[0_1px_2px_rgb(18_38_27/0.05)] ring-1 ring-line"}`}
              >
                {m.error ? m.content : <Markdown text={typing?.index === i ? m.content.slice(0, typing.shown) : m.content} />}
              </div>
              {m.error && i === messages.length - 1 && !busy && (
                <button onClick={retry} className="flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                  <Icon name="retry" className="h-3.5 w-3.5" />
                  Tekrar dene
                </button>
              )}
            </div>
          ),
        )}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-faint">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
            </span>
            Veriler sorgulanıyor…
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="px-4 pb-3 pt-2">
        {locationError && (
          <p role="alert" className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-900 ring-1 ring-amber-200">
            {locationError}
          </p>
        )}
        <div className="rounded-2xl border border-line-strong bg-card shadow-[0_1px_2px_rgb(18_38_27/0.05)] transition focus-within:border-accent/60 focus-within:ring-4 focus-within:ring-accent/10">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Bir soru sorun…"
            className="block max-h-32 min-h-11 w-full resize-none bg-transparent px-3.5 pt-3 text-sm text-ink outline-none placeholder:text-faint"
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <button
              type="button"
              onClick={onRequestLocation}
              disabled={locating}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition ${userLocation ? "bg-accent/10 text-accent" : "text-faint hover:bg-base hover:text-dim"}`}
            >
              <Icon name="locate" className={`h-3.5 w-3.5 ${locating ? "animate-spin" : ""}`} />
              {userLocation ? "Konumunuz paylaşıldı" : locating ? "Konum alınıyor…" : "Konumumu kullan"}
            </button>
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Gönder"
              className="grid h-8 w-8 place-items-center rounded-xl bg-accent text-accent-ink transition hover:bg-accent-strong disabled:bg-base disabled:text-faint"
            >
              <Icon name="send" className="h-4 w-4" />
            </button>
          </div>
        </div>
        <p className="mt-2 truncate text-center text-[10.5px] text-faint">{model ?? "Yanıtlar yapay zekâ ile üretilir, hatalı olabilir."}</p>
      </form>
    </div>
  );
}
