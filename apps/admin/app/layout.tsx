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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${syne.variable} ${dmSans.variable} ${dmMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{__html:
          "(function(){try{var t=localStorage.getItem('mb-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})()"
        }} />
        <script dangerouslySetInnerHTML={{__html: SW_CLEANUP_SCRIPT}} />
      </head>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
