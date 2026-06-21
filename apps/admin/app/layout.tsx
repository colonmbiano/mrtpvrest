import type { Metadata } from "next";
import { Syne, DM_Sans, DM_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const syne = Syne({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-syne",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Panel Admin — Restaurante",
  description: "Sistema de gestión de pedidos",
};

// Cleanup inline que corre ANTES de hidratar React. Desregistra cualquier
// service worker que tenga scope global (/) fuera de /repartidor. Sin esto,
// un SW viejo (del banner de PWA para delivery, que antes se registraba con
// scope /) seguía interceptando requests del admin y sirviendo JS cacheado,
// bloqueando los deploys nuevos.
const SW_CLEANUP_SCRIPT = `
(function(){
  try {
    if (!('serviceWorker' in navigator)) return;
    var isDelivery = location.pathname.indexOf('/repartidor') === 0;
    navigator.serviceWorker.getRegistrations().then(function(regs){
      regs.forEach(function(reg){
        var scope = reg.scope || '';
        var inDelivery = scope.indexOf('/repartidor') !== -1;
        if (isDelivery && inDelivery) return;
        if (!inDelivery) reg.unregister().catch(function(){});
      });
    }).catch(function(){});
    if (!isDelivery && 'caches' in window) {
      caches.keys().then(function(keys){
        keys.forEach(function(k){
          if (k === 'delivery-v1' || k.indexOf('delivery') !== -1) {
            caches.delete(k).catch(function(){});
          }
        });
      }).catch(function(){});
    }
  } catch(e) {}
})();
`;

// Guard global contra el bug nativo de <input type="number">: al hacer scroll
// (rueda del mouse o deslizar en tablet) con el campo enfocado, el navegador
// SUMA/RESTA al valor. En los modales scrollables esto corrompía precios al
// deslizar hacia "Guardar" (ej. 30 → 27). Des-enfocamos en fase de captura,
// ANTES de que el navegador aplique el incremento; passive:true conserva el
// scroll de la página. Cubre toda la app admin y cualquier input futuro.
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
    <html
      lang="es"
      suppressHydrationWarning
      className={`${syne.variable} ${dmSans.variable} ${dmMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{__html:
          "(function(){try{var t=localStorage.getItem('mb-theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}})()"
        }} />
        <script dangerouslySetInnerHTML={{__html: SW_CLEANUP_SCRIPT}} />
        <script dangerouslySetInnerHTML={{__html: NUMBER_WHEEL_GUARD_SCRIPT}} />
      </head>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
