import type { Metadata } from "next";
import "./globals.css";
import ModalRoot from "@/components/tpv/ModalRoot";
import SyncInitializer from "@/components/SyncInitializer";

// Las fuentes se cargan con <link> en runtime en lugar de next/font/google
// porque next/font descarga al BUILD time, y el runner de Android APK
// (Capacitor static export) a veces no puede alcanzar fonts.googleapis.com,
// rompiendo el build. El webview de Capacitor sí tiene internet en runtime.

export const metadata: Metadata = {
  title: "MRTPVREST · TPV",
  description: "Terminal punto de venta MRTPVREST",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" data-theme="green" data-mode="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="antialiased"
        style={{
          // Definimos los CSS vars que tailwind.config.ts referencia, ahora
          // que las fuentes vienen del <link> en lugar de next/font/google.
          ["--font-syne" as any]: "'Syne', sans-serif",
          ["--font-dm-sans" as any]: "'DM Sans', system-ui, sans-serif",
          ["--font-dm-mono" as any]: "'DM Mono', ui-monospace, monospace",
        }}
      >
        <SyncInitializer />
        <ModalRoot>{children}</ModalRoot>
      </body>
    </html>
  );
}
