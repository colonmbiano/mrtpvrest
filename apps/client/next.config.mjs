// @ts-check
import nextPwa from 'next-pwa';

const isDev = process.env.NODE_ENV === 'development';

const withPWA = nextPwa({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: isDev,
  // Excluir manifests dinámicos del precache (cada tenant tiene el suyo).
  buildExcludes: [/middleware-manifest\.json$/, /\/[^/]+\/manifest\.webmanifest$/],
  fallbacks: {
    document: '/_offline',
  },
  runtimeCaching: [
    {
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages-cache',
        networkTimeoutSeconds: 4,
        expiration: { maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
    {
      urlPattern: ({ request }) => request.destination === 'image',
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'images-cache',
        expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /\/_next\/static\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'next-static',
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 24 * 60 * 60 },
      },
    },
    {
      // store/info trae el estado abierto/cerrado. NUNCA servirlo stale: con
      // StaleWhileRevalidate el SW pinta el estado viejo y luego lo revalida,
      // produciendo el parpadeo cerrado↔abierto. NetworkFirst con timeout corto
      // = fresco si hay red, cae a caché solo offline. (El cálculo en sí ya es
      // correcto: el backend computa isOpen con America/Mexico_City.)
      urlPattern: /\/api\/store\/info.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'store-api-info',
        networkTimeoutSeconds: 3,
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      // menu/locations sí pueden ir stale (no afectan abierto/cerrado).
      urlPattern: /\/api\/store\/(menu|locations).*/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'store-api',
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts',
        expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
});

// Los 3 primeros headers son seguros de activar ya. El CSP va en Report-Only a
// propósito: NO bloquea nada, solo reporta en consola. Tras unos días sin
// reportes que rompan (Cloudinary, scripts de Vercel, backend Railway), cambiar
// la key a 'Content-Security-Policy' y afinar connect-src con la URL real.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Content-Security-Policy-Report-Only',
    value: [
      "default-src 'self'",
      "img-src 'self' https://res.cloudinary.com https://*.cloudinary.com data: blob:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.vercel.app",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' https://fonts.gstatic.com data:",
      "connect-src 'self' https://*.mrtpvrest.com https://*.railway.app https://res.cloudinary.com",
      "frame-ancestors 'self'",
    ].join('; '),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  typescript: { ignoreBuildErrors: true },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '**.cloudinary.com' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withPWA(nextConfig);
