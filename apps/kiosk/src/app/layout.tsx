import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AccentInjector } from "@/components/AccentInjector";
import { KioskStyleInjector } from "@/components/KioskStyleInjector";

export const metadata: Metadata = {
  title: "Kiosko — Autoservicio",
  description: "Sistema de pedidos de autoservicio",
};

const preHydrate = `(function(){try{
  var s = localStorage.getItem('kiosk-style') || 'oled';
  if (['oled','pop','boutique'].indexOf(s) === -1) s = 'oled';
  document.documentElement.setAttribute('data-kiosk-style', s);
  var a = localStorage.getItem('mb-accent');
  if (a) document.documentElement.style.setProperty('--brand-primary', a);
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-kiosk-style="oled">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no, maximum-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: preHydrate }} />
      </head>
      <body>
        <KioskStyleInjector />
        <AccentInjector />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
