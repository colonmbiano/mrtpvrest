/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**' },
    ],
  },
}

// Sentry opcional. Solo activa si @sentry/nextjs está instalado Y SENTRY_DSN definida.
// Para activar en prod:
//   1. pnpm add @sentry/nextjs --filter @mrtpvrest/admin
//   2. set SENTRY_DSN (server) y NEXT_PUBLIC_SENTRY_DSN (client) en Vercel
let moduleExports = nextConfig;

try {
  // eslint-disable-next-line global-require
  const { withSentryConfig } = require('@sentry/nextjs');
  if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
    moduleExports = withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: true,
      widenClientFileUpload: true,
      hideSourceMaps: true,
      disableLogger: true,
      automaticVercelMonitors: false,
    });
  }
} catch (_e) {
  // @sentry/nextjs no instalado — noop
}

module.exports = moduleExports;

// last deploy: abril 2026
