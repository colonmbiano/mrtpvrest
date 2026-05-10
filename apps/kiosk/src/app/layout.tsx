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
        <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no, maximum-scale=1, viewport-fit=cover" />
        <script dangerouslySetInnerHTML={{ __html: preHydrate }} />
      </head>
      <body className="relative overflow-hidden">
        {/* Halo Global Background Accents */}
        <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden bg-[#0C0C0E]">
          <div className="absolute -top-[10%] -left-[10%] w-[70%] h-[70%] halo-glow-primary opacity-20" />
          <div className="absolute -bottom-[10%] -right-[10%] w-[80%] h-[80%] halo-glow-success opacity-10" />
        </div>

        <KioskStyleInjector />
        <AccentInjector />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
