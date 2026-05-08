import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MRTPV KDS · Estación de cocina",
  description: "Terminal de cocina MRTPVREST",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="antialiased"
        style={{
          background: "#0a0a0c",
          color: "white",
          fontFamily: "'Outfit', system-ui, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
