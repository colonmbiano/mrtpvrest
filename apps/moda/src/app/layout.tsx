import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "MODA+ · Smart Retail Flow",
  description: "TPV retail para tiendas de ropa",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
