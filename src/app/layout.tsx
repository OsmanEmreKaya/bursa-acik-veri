import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Paylaşım görselinin (opengraph-image.png) tam adresi bundan üretilir; yayında SITE_URL verilmeli.
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: "Bursa Açık Veri",
  description: "Bursa'nın canlı açık verileri için harita ve yapay zekâ destekli veri platformu",
};

// Telefonda tarayıcı çubuğu üst başlıkla aynı yeşilde görünsün.
export const viewport: Viewport = { themeColor: "#00843d", colorScheme: "light" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-base text-ink">{children}</body>
    </html>
  );
}
