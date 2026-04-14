import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "Panel Admin — Restaurante",
  description: "Sistema de gestión de pedidos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <script dangerouslySetInnerHTML={{__html:
          "(function(){try{var t=localStorage.getItem('mb-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})()"
        }} />
      </head>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
