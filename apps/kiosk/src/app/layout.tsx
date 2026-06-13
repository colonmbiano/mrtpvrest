import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AccentInjector } from "@/components/AccentInjector";
import { KioskStyleInjector } from "@/components/KioskStyleInjector";
import { AccessibilityBar } from "@/components/AccessibilityBar";

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

// Guard global contra el bug nativo de <input type="number">: con el campo
// enfocado, hacer scroll (rueda/trackpad) SUMA/RESTA al valor. Des-enfocamos
// en wheel (fase de captura, antes del incremento; passive conserva scroll).
const NUMBER_WHEEL_GUARD_SCRIPT = `(function(){try{
  document.addEventListener('wheel', function(){
    var el = document.activeElement;
    if (el && el.tagName === 'INPUT' && el.type === 'number') el.blur();
  }, { passive: true, capture: true });
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-kiosk-style="oled">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no, maximum-scale=1, viewport-fit=cover" />
        <script dangerouslySetInnerHTML={{ __html: preHydrate }} />
        <script dangerouslySetInnerHTML={{ __html: NUMBER_WHEEL_GUARD_SCRIPT }} />
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
        <AccessibilityBar />
      </body>
    </html>
  );
}
