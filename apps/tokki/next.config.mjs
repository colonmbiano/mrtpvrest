import { readFileSync } from 'node:fs';

const isMobileBuild = process.env.CAPACITOR_BUILD === 'true';
const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_OTA_ENABLED: 'false',
  },
  output: isMobileBuild ? 'export' : undefined,
  distDir: isMobileBuild ? '.next-apk' : '.next',
  trailingSlash: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '**.cloudinary.com' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  ...(isMobileBuild ? {} : {
    async rewrites() {
      return [
        {
          source: '/kds/:path*',
          destination: 'http://localhost:3009/kds/:path*',
        },
      ];
    },
  }),
};
export default nextConfig;
