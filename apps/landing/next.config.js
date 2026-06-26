/** @type {import('next').NextConfig} */

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    // La landing NO usa micrófono/cámara (eso vive en apps/tpv, otro subdominio).
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  {
    // CSP en ENFORCE. Validada en Report-Only contra el sitio en vivo con navegador
    // headless: cero violaciones en home, funciones, blog, giros, comparativa y /demo.
    // Si agregas un origen nuevo (Cloudinary, analytics, fuentes externas), permítelo
    // en img-src/connect-src/script-src/font-src ANTES de desplegar o romperá la carga.
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self' https://admin.mrtpvrest.com",
      // Next.js inyecta scripts inline; en modo Report-Only arrancamos permisivo.
      "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://res.cloudinary.com",
      "font-src 'self'",
      "connect-src 'self' https://admin.mrtpvrest.com https://vitals.vercel-insights.com",
    ].join('; '),
  },
]

module.exports = {
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        // Fuerza la descarga correcta de los APK estáticos (public/apks).
        source: '/apks/:file*',
        headers: [
          { key: 'Content-Type', value: 'application/vnd.android.package-archive' },
          { key: 'Content-Disposition', value: 'attachment' },
        ],
      },
    ]
  },
}
