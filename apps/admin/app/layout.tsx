import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Panel Admin — Restaurante",
  description: "Sistema de gestion de pedidos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <script dangerouslySetInnerHTML={{__html: "(function(){try{var t=localStorage.getItem('mb-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})()"}} />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
