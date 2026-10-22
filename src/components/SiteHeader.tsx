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
      <Link href="/" className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        <span className="flex h-10 flex-none items-center rounded-xl bg-white px-1 shadow-sm sm:h-12 sm:px-1.5">
          <Image src="/brand/emblem-mark.webp" alt="" width={240} height={143} preload unoptimized className="h-8 w-auto sm:h-10" />
        </span>
        <span className="leading-tight">
          <span className="block whitespace-nowrap text-sm font-semibold tracking-tight text-white sm:text-[15px]">Bursa Açık Veri</span>
          <span className="hidden text-[11px] text-white/70 sm:block">Kentin canlı verileri, tek haritada</span>
        </span>
      </Link>
      <nav className="flex flex-none gap-1 rounded-xl bg-black/10 p-1">
        {item("/", "harita", "Harita", "map")}
        {item("/veri-setleri", "veri", "Veri Setleri", "database")}
      </nav>
    </header>
  );
}
