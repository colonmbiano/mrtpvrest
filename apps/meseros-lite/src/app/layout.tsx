import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import OfflineSyncInitializer from "@/components/OfflineSyncInitializer";
import SessionGate from "@/components/SessionGate";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MRTPVREST Meseros Lite",
  description: "Comanda ligera offline-first para tablets Android de piso.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0a0a0c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={outfit.variable}>
      <body className="min-h-screen overflow-hidden bg-[#0a0a0c] font-sans text-neutral-200">
        <OfflineSyncInitializer />
        <SessionGate>{children}</SessionGate>
      </body>
    </html>
  );
}
