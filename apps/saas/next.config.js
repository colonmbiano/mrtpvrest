/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/ajustes',
        destination: '/planes',
        permanent: true,
      },
    ];
  },
};
module.exports = nextConfig;
