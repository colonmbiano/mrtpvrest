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

// Viewport por defecto (rutas fuera de [slug]). NO bloqueamos el zoom (sin
// maximumScale) por accesibilidad. Cada tienda sobreescribe themeColor con su
// color de marca vía generateViewport en [slug]/page.tsx.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ff5c35",
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
    <html lang="es" className={`${syne.variable} ${dmSans.variable}`}>
      <body className="antialiased font-sans">
        <script dangerouslySetInnerHTML={{__html: NUMBER_WHEEL_GUARD_SCRIPT}} />
        {children}
      </body>
    </html>
  );
}
