import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Geliştirme sunucusunu aynı Wi-Fi'deki telefondan (http://192.168.x.x:3000) açabilmek için.
  allowedDevOrigins: ["192.168.*.*"],
  // Geliştirme rozeti hangi köşeye konsa sohbet kutusunun ya da lejantın üstüne biniyor.
  // Kapalıyken de derleme ve çalışma hataları ekranda gösterilir.
  devIndicators: false,
  partialPrefetching: true,
};

export default nextConfig;
