import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const isMobileBuild = process.env.CAPACITOR_BUILD === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isMobileBuild ? "export" : undefined,
  images: { unoptimized: true },
  turbopack: { root: path.resolve(appDir, "../..") },
  trailingSlash: true,
  // La plantilla CSV se abre desde el APK en el navegador del sistema: forzar
  // descarga en vez de mostrarla como texto. headers() no aplica al export
  // estático (build del APK), por eso solo se define en el build web.
  ...(isMobileBuild
    ? {}
    : {
        async headers() {
          return [
            {
              source: "/plantilla-catalogo.csv",
              headers: [
                { key: "Content-Type", value: "text/csv; charset=utf-8" },
                { key: "Content-Disposition", value: 'attachment; filename="plantilla-catalogo.csv"' },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
