import type { Metadata, Viewport } from "next";
import { Syne, DM_Sans, Bebas_Neue, Montserrat, Baloo_2, Quicksand } from "next/font/google";
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

// Tipografías del tema "Mundialista": Bebas Neue (titulares condensados tipo
// estadio) + Montserrat (cuerpo/precios/CTAs). Solo las usa ese tema, pero se
// cargan aquí para aprovechar el self-hosting de next/font (sin FOUT).
const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-bebas",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-montserrat",
});

// Tipografías del tema "Kawaii / Boutique" (storefront pastel): Baloo 2
// (titulares redondeados, bubbly) + Quicksand (cuerpo redondeado, amable).
const baloo2 = Baloo_2({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-baloo",
});

const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-quicksand",
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
    <html lang="es" className={`${syne.variable} ${dmSans.variable} ${bebasNeue.variable} ${montserrat.variable} ${baloo2.variable} ${quicksand.variable}`}>
      <head>
        {/* Las imágenes (menú, banners, logos) se sirven desde Cloudinary;
            adelantamos la conexión para acelerar la primera carga. */}
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://res.cloudinary.com" />
      </head>
      <body className="antialiased font-sans">
        <script dangerouslySetInnerHTML={{__html: NUMBER_WHEEL_GUARD_SCRIPT}} />
        {children}
      </body>
    </html>
  );
}
