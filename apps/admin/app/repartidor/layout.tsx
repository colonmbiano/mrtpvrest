import type { Metadata } from "next";
import PWAInstallBanner from "@/components/delivery/PWAInstallBanner";

export const metadata: Metadata = {
  title: "Master Burger's - Repartidor",
  description: "App de entregas",
  manifest: "/manifest-delivery.json",
  themeColor: "#f5a623",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Repartidor",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function RepartidorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="manifest" href="/manifest-delivery.json" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="theme-color" content="#f5a623" />
      {children}
      <PWAInstallBanner />
    </>
  );
}