import Link from "next/link";

export default function SiteHeader({ active }: { active: "harita" | "veri" }) {
  const item = (href: string, key: typeof active, label: string) => (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition ${active === key ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:text-slate-900"}`}
    >
      {label}
    </Link>
  );
  return (
    <header className="flex h-14 flex-none items-center justify-between border-b border-slate-200 bg-white px-4">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-700 text-sm font-bold text-white">B</span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold text-slate-900">Bursa Açık Veri</span>
          <span className="hidden text-[11px] text-slate-500 sm:block">Canlı veri · Harita · Yapay zekâ asistanı</span>
        </span>
      </Link>
      <nav className="flex gap-1">
        {item("/", "harita", "Harita")}
        {item("/veri-setleri", "veri", "Veri Setleri")}
      </nav>
    </header>
  );
}
