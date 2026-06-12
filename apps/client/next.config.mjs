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
      // El estado abierto/cerrado, el menú y los precios se renderizan en el
      // servidor a partir de datos en vivo (hora local del backend). Cachear el
      // HTML de la tienda hacía que una visita previa con la tienda CERRADA se
      // pintara primero y luego "saltara" a ABIERTA al revalidar — el bug de
      // horario reportado en la auditoría. Servimos siempre desde la red; el
      // fallback `/_offline` (ver `fallbacks.document`) cubre el caso sin red.
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkOnly',
      options: {
        cacheName: 'pages-cache',
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
      // Datos sensibles a la hora (info/menu/locations incluyen isOpen y
      // precios). NetworkFirst en vez de StaleWhileRevalidate para no entregar
      // un estado abierto/cerrado caducado; la caché solo actúa sin red.
      urlPattern: /\/api\/store\/(info|menu|locations).*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'store-api',
        networkTimeoutSeconds: 4,
        expiration: { maxEntries: 100, maxAgeSeconds: 5 * 60 },
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

// Política de seguridad de contenido. Permisiva con lo que la tienda usa de
// verdad (Google Fonts, imágenes de Cloudinary/otros hosts vía https, estilos
// y scripts inline que Next.js inyecta) pero cierra los vectores principales:
// embedding (frame-ancestors), base-uri y objetos.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

// Cabeceras de seguridad ausentes detectadas en la auditoría. Se aplican a
// todas las rutas; complementan al HSTS que ya sirve Vercel.
const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  // No exponer "x-powered-by: Next.js" (fuga de información de stack).
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '**.cloudinary.com' },
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default withPWA(nextConfig);
