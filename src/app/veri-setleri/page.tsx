import type { Metadata } from "next";
import DatasetCatalog from "@/components/DatasetCatalog";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = { title: "Veri Setleri · Bursa Açık Veri" };

export default function DatasetsPage() {
  return (
    <div className="min-h-dvh bg-base">
      <SiteHeader active="veri" />
      <DatasetCatalog />
    </div>
  );
}
