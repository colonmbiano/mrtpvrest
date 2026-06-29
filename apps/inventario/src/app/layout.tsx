import type { Metadata, Viewport } from "next";
import OtaUpdater from "@/components/OtaUpdater";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "MRTPV Inventario",
  description: "Inventario independiente para MRTPVREST",
};

export const viewport: Viewport = {
  themeColor: "#0f1411",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <OtaUpdater />
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
