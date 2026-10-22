import Image from "next/image";
import Link from "next/link";
import { Icon, type IconName } from "./Icons";

export default function SiteHeader({ active }: { active: "harita" | "veri" }) {
  const item = (href: string, key: typeof active, label: string, icon: IconName) => (
    <Link
      href={href}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition sm:px-3 sm:text-sm ${active === key ? "bg-white text-accent shadow-sm" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
    >
      <Icon name={icon} className="hidden h-4 w-4 sm:block" />
      {label}
    </Link>
  );
  return (
    <header className="relative flex h-14 flex-none items-center justify-between gap-3 bg-accent px-3 sm:h-16 sm:px-4 shadow-[inset_0_-1px_0_rgb(0_0_0/0.08)]">
      {/* Amblemin beyaz silueti ve amblemdeki "BURSA / AÇIK VERİ" yazı düzeni; yeşil şerit üzerinde tek renk. */}
      <Link href="/" aria-label="Bursa Açık Veri ana sayfa" className="flex min-w-0 items-center gap-3">
        <Image src="/brand/emblem-white.png" alt="" width={208} height={120} preload unoptimized className="h-8 w-auto sm:h-10" />
        <span aria-hidden className="h-7 w-px flex-none bg-white/30 sm:h-8" />
        <span className="leading-none text-white">
          <span className="block whitespace-nowrap text-[15px] font-bold tracking-[0.14em] sm:text-[17px]">BURSA</span>
          <span className="mt-1 block whitespace-nowrap text-[9.5px] font-medium tracking-[0.34em] text-white/80 sm:text-[10.5px]">AÇIK VERİ</span>
        </span>
      </Link>
      <nav className="flex flex-none gap-1 rounded-xl bg-black/10 p-1">
        {item("/", "harita", "Harita", "map")}
        {item("/veri-setleri", "veri", "Veri Setleri", "database")}
      </nav>
    </header>
  );
}
