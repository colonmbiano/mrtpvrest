import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk, Onest, DM_Mono } from "next/font/google";
import OfflineSyncInitializer from "@/components/OfflineSyncInitializer";
import OtaUpdater from "@/components/OtaUpdater";
import PrinterConfigInitializer from "@/components/PrinterConfigInitializer";
import SessionGate from "@/components/SessionGate";
import "./globals.css";

// Mismas familias que el TPV (tema Fresco): Schibsted Grotesk para títulos,
// Onest para cuerpo, DM Mono para cifras/dinero.
const schibsted = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-schibsted",
  display: "swap",
});

const onest = Onest({
  subsets: ["latin"],
  variable: "--font-onest",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
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
  themeColor: "#0e1512",
};

// Guard global contra el bug nativo de <input type="number">: con el campo
// enfocado, hacer scroll (rueda/trackpad) SUMA/RESTA al valor. Des-enfocamos
// en wheel (fase de captura, antes del incremento; passive conserva scroll).
const NUMBER_WHEEL_GUARD_SCRIPT = `
(function(){
  try {
    document.addEventListener('wheel', function(){
      var el = document.activeElement;
      if (el && el.tagName === 'INPUT' && el.type === 'number') el.blur();
    }, { passive: true, capture: true });
  } catch(e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${schibsted.variable} ${onest.variable} ${dmMono.variable}`}>
      <body className="min-h-screen overflow-hidden bg-[var(--bg)] font-sans text-[var(--text-primary)]">
        <script dangerouslySetInnerHTML={{__html: NUMBER_WHEEL_GUARD_SCRIPT}} />
        <OtaUpdater />
        <OfflineSyncInitializer />
        <PrinterConfigInitializer />
        <SessionGate>{children}</SessionGate>
      </body>
    </html>
  );
}
