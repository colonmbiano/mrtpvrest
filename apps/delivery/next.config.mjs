/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@mrtpvrest/config", "@mrtpvrest/database", "@mrtpvrest/types"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  ...(process.env.CAPACITOR_BUILD === 'true' ? {
    output: 'export',
    images: {
      unoptimized: true,
    }
  } : {})
};

export default nextConfig;
