const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  // Raíz del monorepo para que el bundler resuelva los workspaces.
  turbopack: { root: path.resolve(__dirname, "../..") },
  // Proxy same-origin /api/* → backend para evitar CORS desde el navegador.
  // El cliente axios usa paths relativos (/api/...) y Next reescribe a
  // NEXT_PUBLIC_API_URL/api/... en el edge. Sin la env no inyectamos el
  // rewrite para no romper el build.
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL;
    if (!api) return [];
    const base = api.replace(/\/$/, "");
    return [{ source: "/api/:path*", destination: `${base}/api/:path*` }];
  },
};

module.exports = nextConfig;
