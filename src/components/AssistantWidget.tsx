"use client";

import Image from "next/image";
import { type ComponentProps, useEffect, useState } from "react";
import ChatPanel, { type ChatStatus } from "./ChatPanel";
import { Icon } from "./Icons";

type Pose = "sleeping" | "standing" | "thinking" | "idea";
const POSES: Pose[] = ["sleeping", "standing", "thinking", "idea"];

const STATUS_TEXT: Record<Pose, string> = {
  sleeping: "Uyuyor",
  standing: "Sorunuzu bekliyor",
  thinking: "Düşünüyor…",
  idea: "Yanıtı yazıyor…",
};

// Dört poz üst üste durur, yalnızca biri görünür; geçişte yanıp sönme olmasın diye hepsi baştan yüklenir.
function Mascot({ pose, className }: { pose: Pose; className: string }) {
  return (
    <span className={`relative block ${className}`}>
      {POSES.map((p) => (
        <Image
          key={p}
          src={`/mascot/${p}.webp`}
          alt=""
          width={287}
          height={360}
          unoptimized
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${p === pose ? "opacity-100" : "opacity-0"}`}
        />
      ))}
    </span>
  );
}

type Props = Omit<ComponentProps<typeof ChatPanel>, "onStatusChange"> & { onOpenChange?: (open: boolean) => void };

export default function AssistantWidget({ onOpenChange, ...chatProps }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const pose: Pose = status === "thinking" ? "thinking" : status === "writing" ? "idea" : open ? "standing" : "sleeping";

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Sohbet penceresi kapalıyken de bağlı kalır; konuşma ve yazılan metin kaybolmaz. */}
      <section
        aria-label="Asistan"
        className={`fixed inset-0 z-40 flex flex-col bg-panel md:absolute md:inset-auto md:bottom-[10.5rem] md:right-4 md:h-[min(640px,calc(100%-16rem))] md:w-[400px] md:overflow-hidden md:rounded-2xl md:border md:border-line md:shadow-2xl md:shadow-ink/15 ${open ? "" : "hidden"}`}
      >
        <header className="flex flex-none items-center gap-3 border-b border-line bg-card px-4 py-2.5">
          <span className="grid h-11 w-11 flex-none place-items-end overflow-hidden rounded-xl bg-accent/10">
            <Mascot pose={pose} className="h-11 w-9" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-ink">Asistan</h2>
            <p className="flex items-center gap-1.5 text-[11px] text-faint">
              <span className={`h-1.5 w-1.5 rounded-full ${status === "idle" ? "bg-accent" : "animate-pulse bg-amber-500"}`} />
              {STATUS_TEXT[pose]}
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Asistanı kapat"
            className="grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-base hover:text-ink"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1">
          <ChatPanel {...chatProps} onStatusChange={setStatus} />
        </div>
      </section>

      {/* Asistan sağ altta, haritanın kaynak bilgisinin (ⓘ) hemen üstünde durur; timsah haritaya, yani sola bakar
          ve balon onun solunda açılır. */}
      <div className={`group absolute bottom-10 right-3 z-30 flex flex-row-reverse items-end gap-1 ${open ? "max-md:hidden" : ""}`}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Asistanı kapat" : "Asistanı aç"}
          aria-expanded={open}
          className="flex-none rounded-2xl transition duration-200 hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-0"
        >
          {/* Düğme timsahın kendisi; gölge kutuya değil karakterin şekline düşer, açık haritada da seçilir. */}
          <Mascot pose={pose} className="h-[120px] w-[96px] [filter:drop-shadow(0_6px_8px_rgb(18_38_27/0.28))]" />
        </button>
        {/* Pencere kapalıyken maskotun ne yaptığı konuşma balonunda görünür. */}
        {!open && (
          <span
            className={`mb-16 whitespace-nowrap rounded-2xl rounded-br-sm border border-line bg-card px-3 py-1.5 text-xs font-medium shadow-md shadow-ink/10 transition pointer-events-none ${status === "idle" ? "text-dim opacity-0 group-hover:opacity-100" : "text-ink opacity-100"}`}
          >
            {status === "idle" ? "Bir şey sorun" : STATUS_TEXT[pose]}
          </span>
        )}
      </div>
    </>
  );
}
