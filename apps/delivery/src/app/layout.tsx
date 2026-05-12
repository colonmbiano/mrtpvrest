import type { Metadata } from "next";
import "./globals.css";
import SyncIndicator from "@/components/SyncIndicator";

// MIGRACIÓN: las fuentes se cargan con <link> en runtime (igual que TPV/KDS)
// en lugar de next/font/google. Razón: next/font descarga al BUILD time y
// el runner Capacitor (APK static export) no siempre puede alcanzar
// fonts.googleapis.com, rompiendo el build. El WebView sí tiene internet
// en runtime y la carga es rápida con preconnect.
export const metadata: Metadata = {
  title: "MRTPV Delivery",
  description: "Sistema de Reparto Premium",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark" data-mode="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=DM+Mono:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-surf-0 text-tx-pri min-h-screen relative">
        {/* Halo Glows Background — usan los tokens del nuevo sistema */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
          <div className="absolute -top-[10%] -left-[10%] w-[70%] h-[70%] halo-glow-primary opacity-50" />
          <div className="absolute -bottom-[10%] -right-[10%] w-[80%] h-[80%] halo-glow-success opacity-30" />
        </div>

        <SyncIndicator />
        <main className="relative z-0">
          {children}
        </main>
      </body>
    </html>
  );
}
