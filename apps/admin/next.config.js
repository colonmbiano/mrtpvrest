/** @type {import('next').NextConfig} */
const nextConfig = {
  // TODO(audit-H2b): 347 errors pre-existentes en next lint (no-explicit-any,
  // no-unused-vars). ignoreBuildErrors de TS ya NO se usa — el typecheck corre
  // estricto. Quitar este flag tras limpieza de lint.
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**' },
    ],
  },
}
module.exports = nextConfig

// last deploy: abril 2026
