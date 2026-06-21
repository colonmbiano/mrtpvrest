import type { MetadataRoute } from "next";

// Con `output: export` (build de APK Capacitor) Next no puede prerenderizar
// rutas de metadata generadas por código sin una directiva estática explícita;
// sin esto el build:apk falla con "dynamic = force-static not configured on
// route /manifest.webmanifest". El manifest no depende de request, así que
// forzarlo a estático es correcto tanto en web como en el export.
export const dynamic = "force-static";

// Web App Manifest del repartidor (PWA instalable en iOS/Android).
// Nota: iOS Safari ignora la mayoría de estos campos para "Añadir a inicio";
// la configuración crítica de iOS vive en los meta de Apple en layout.tsx.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Master Burger's Delivery",
    short_name: "MB Delivery",
    description: "App de reparto para repartidores de Master Burger's",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ff5c35",
    theme_color: "#ff5c35",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
