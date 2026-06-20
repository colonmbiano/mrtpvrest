import type { MetadataRoute } from "next";

// Metadata route estático: Next genera /manifest.webmanifest y enlaza el
// <link rel="manifest"> automáticamente. force-static lo deja compatible con
// el build de Capacitor (output: 'export'), donde no hay handlers dinámicos.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MRTPVREST · TPV",
    short_name: "MRTPVREST",
    description: "Terminal punto de venta MRTPVREST",
    start_url: "/",
    display: "standalone",
    background_color: "#0C0C0E",
    theme_color: "#0E1512",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
