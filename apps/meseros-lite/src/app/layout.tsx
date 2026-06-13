import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import OfflineSyncInitializer from "@/components/OfflineSyncInitializer";
import PrinterConfigInitializer from "@/components/PrinterConfigInitializer";
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
    <html lang="es" className={outfit.variable}>
      <body className="min-h-screen overflow-hidden bg-[#0a0a0c] font-sans text-neutral-200">
        <script dangerouslySetInnerHTML={{__html: NUMBER_WHEEL_GUARD_SCRIPT}} />
        <OfflineSyncInitializer />
        <PrinterConfigInitializer />
        <SessionGate>{children}</SessionGate>
      </body>
    </html>
  );
}
