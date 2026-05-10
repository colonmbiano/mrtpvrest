import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import SyncIndicator from "@/components/SyncIndicator";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "MRTPV Delivery",
  description: "Sistema de Reparto Premium - Warm Tech",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body
        className={`${geistSans.variable} ${jetbrainsMono.variable} antialiased bg-halo-bg text-white min-h-screen relative`}
      >
        {/* Halo Glows Background */}
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
