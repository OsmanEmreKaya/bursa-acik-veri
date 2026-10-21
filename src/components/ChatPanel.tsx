"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import type { MapAction } from "@/lib/map-actions";
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

const SUGGESTIONS = [
  "Son bir haftada Bursa'da deprem oldu mu?",
  "Bugün hava kalitesi en kötü ilçe hangisi?",
  "Barajlar geçen yıla göre ne durumda?",
  "Halde domates kaç lira?",
  "Altınşehir'e en yakın toplanma alanı nerede?",
  "Bu hafta hangi etkinlikler var?",
];

type Props = {
  onActions: (actions: MapAction[]) => void;
  getContext: () => { userLocation?: [number, number]; mapCenter?: [number, number] };
  userLocation?: [number, number];
  onRequestLocation: () => void;
  locating: boolean;
};

export default function ChatPanel({ onActions, getContext, userLocation, onRequestLocation, locating }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!messages.length) return;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

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
      setMessages((m) => [...m, { role: "assistant", content: body.reply || "(boş yanıt)", trace: body.trace }]);
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
          <div className="space-y-3">
            <div className="rounded-xl bg-teal-50 p-3 text-sm text-teal-900 ring-1 ring-teal-100">
              Bursa&apos;nın canlı açık verilerine doğal dille soru sorun. Asistan ilgili veri setini sorgular, yanıtı yazar
              ve sonucu haritada gösterir.
            </div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Örnek sorular</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-left text-xs text-slate-700 transition hover:border-teal-400 hover:bg-teal-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-teal-700 px-3.5 py-2 text-sm text-white">{m.content}</div>
            </div>
          ) : (
            <div key={i} className="flex flex-col items-start gap-1.5">
              {!!m.trace?.length && (
                <div className="flex flex-wrap gap-1">
                  {m.trace.map((t, j) => (
                    <span
                      key={j}
                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${t.ok ? "bg-slate-100 text-slate-600" : "bg-red-50 text-red-700"}`}
                    >
                      {t.ok ? "✓" : "✗"} {TOOL_LABELS[t.tool] ?? t.tool}
                    </span>
                  ))}
                </div>
              )}
              <div
                className={`max-w-[95%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm ${m.error ? "bg-red-50 text-red-800 ring-1 ring-red-200" : "bg-white text-slate-800 ring-1 ring-slate-200"}`}
              >
                {m.error ? m.content : <Markdown text={m.content} />}
              </div>
              {m.error && i === messages.length - 1 && !busy && (
                <button onClick={retry} className="text-xs font-medium text-teal-700 hover:underline">
                  ↻ Tekrar dene
                </button>
              )}
            </div>
          ),
        )}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-600 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-600 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-600" />
            </span>
            Veriler sorgulanıyor…
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="border-t border-slate-200 bg-white p-3">
        <div className="flex items-end gap-2">
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
            className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="h-10 rounded-xl bg-teal-700 px-4 text-sm font-medium text-white transition hover:bg-teal-800 disabled:opacity-40"
          >
            Gönder
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
          <button type="button" onClick={onRequestLocation} className="hover:text-teal-700" disabled={locating}>
            {userLocation ? "📍 Konumunuz paylaşıldı" : locating ? "Konum alınıyor…" : "📍 Konumumu kullan"}
          </button>
          <span>{model ?? "LLM yanıtları hatalı olabilir"}</span>
        </div>
      </form>
    </div>
  );
}
