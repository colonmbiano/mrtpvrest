import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@mrtpvrest/config", "@mrtpvrest/database", "@mrtpvrest/types"],
  env: {
    // Versión de la app expuesta al cliente (la lee VersionTag para mostrarla en
    // el PIN cuando corre en web). En la APK gana la versión del bundle OTA.
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  trailingSlash: true,
  ...(process.env.CAPACITOR_BUILD === 'true' ? {
    output: 'export',
    images: {
      unoptimized: true,
    }
  } : {})
};

export default nextConfig;
