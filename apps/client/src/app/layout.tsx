import type { Metadata, Viewport } from "next";
import { Syne, DM_Sans } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-syne",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "Pedidos Online | MRTPVREST",
  description: "Haz tu pedido en línea de forma fácil y rápida.",
  applicationName: "MRTPVREST Tienda",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tienda",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No fijamos maximumScale: bloquear el pinch-zoom incumple WCAG 2.1 (1.4.4).
  // El acento corporativo por defecto; cada tienda lo sobreescribe en
  // `[slug]/page.tsx` (generateViewport) con su propio color de marca.
  themeColor: "#ff5c35",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${syne.variable} ${dmSans.variable}`}>
      <body className="antialiased font-sans">{children}</body>
    </html>
  );
}
