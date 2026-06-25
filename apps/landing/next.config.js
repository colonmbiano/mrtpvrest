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
    // EMPIEZA en Report-Only. Vigila la consola unos días y luego renómbralo
    // a "Content-Security-Policy" (sin -Report-Only) para hacerlo cumplir.
    key: 'Content-Security-Policy-Report-Only',
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
