import type { Metadata, Viewport } from "next";
import "./globals.css";
import ModalRoot from "@/components/tpv/ModalRoot";
import SyncInitializer from "@/components/SyncInitializer";
import OfflineIndicator from "@/components/OfflineIndicator";
import OtaUpdater from "@/components/OtaUpdater";
import AutoLock from "@/components/AutoLock";
import ConsolePatch from "@/components/ConsolePatch";

// Las fuentes se cargan con <link> en runtime en lugar de next/font/google
// porque next/font descarga al BUILD time, y el runner de Android APK
// (Capacitor static export) a veces no puede alcanzar fonts.googleapis.com,
// rompiendo el build. El webview de Capacitor sí tiene internet en runtime.

export const metadata: Metadata = {
  title: "MRTPVREST · TPV",
  description: "Terminal punto de venta MRTPVREST",
};

// Sin este viewport, el WebView de Android (Capacitor) y las tablets usan
// un viewport de escritorio (~980px) y renderizan el TPV "agarrando toda
// la pantalla" sin autoajustarse (PIN, corte de caja, etc.). En un kiosko
// POS bloqueamos el pinch-zoom para que el layout no se rompa al tocar.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0E1512",
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
          href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&family=Onest:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{__html: NUMBER_WHEEL_GUARD_SCRIPT}} />
      </head>
      <body
        className="antialiased"
        suppressHydrationWarning
        style={{
          // Definimos los CSS vars que tailwind.config.ts referencia, ahora
          // que las fuentes vienen del <link> en lugar de next/font/google.
          // FRESCO: display → Schibsted Grotesk, cuerpo → Onest. Mantenemos
          // los mismos nombres de variable (--font-syne/--font-outfit) para
          // que font-display/font-syne/font-sans cambien sin tocar más código.
          ["--font-syne" as any]: "'Schibsted Grotesk', system-ui, sans-serif",
          ["--font-outfit" as any]: "'Onest', system-ui, sans-serif",
          ["--font-dm-mono" as any]: "'DM Mono', ui-monospace, monospace",
        }}
      >
        <ConsolePatch />
        <SyncInitializer />
        <OfflineIndicator />
        <OtaUpdater />
        <AutoLock />
        <ModalRoot>{children}</ModalRoot>
      </body>
    </html>
  );
}
