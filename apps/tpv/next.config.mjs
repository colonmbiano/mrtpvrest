const isMobileBuild = process.env.CAPACITOR_BUILD === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isMobileBuild ? 'export' : undefined,
  trailingSlash: true,
  typescript: { ignoreBuildErrors: true },
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
