import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "MRTPV Retail · Smart Retail Flow",
  description: "TPV retail para tiendas de ropa",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover" as const,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
