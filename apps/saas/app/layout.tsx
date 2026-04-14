import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SaaS Central — MRTPVREST",
  description: "Panel de control global",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <script dangerouslySetInnerHTML={{__html:
          "(function(){try{var t=localStorage.getItem('saas-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})()"
        }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
