import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SaaS Central — MRTPVREST",
  description: "Panel de control global",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MRTPV Admin",
  },
  formatDetection: {
    telephone: false,
  },
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
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#7c3aed" />
        <script dangerouslySetInnerHTML={{__html:
          "(function(){try{var t=localStorage.getItem('saas-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})()"
        }} />
        <script dangerouslySetInnerHTML={{__html: NUMBER_WHEEL_GUARD_SCRIPT}} />
      </head>
      <body>{children}</body>
    </html>
  );
}
