import type { Metadata } from "next";
import { Syne, DM_Sans, DM_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { PermissionGateProvider } from "@/contexts/PermissionGateContext";

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
  title: "MRTPVREST · TPV",
  description: "Terminal punto de venta MRTPVREST",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" data-theme="green" data-mode="dark" suppressHydrationWarning>
      <body
        className={`${syne.variable} ${dmSans.variable} ${dmMono.variable} antialiased`}
      >
        <PermissionGateProvider>
          {children}
          <Toaster
            position="bottom-right"
            theme="dark"
            richColors
            closeButton
            toastOptions={{
              style: {
                background: "var(--surface-1)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              },
            }}
          />
        </PermissionGateProvider>
      </body>
    </html>
  );
}
