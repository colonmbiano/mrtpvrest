import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const isMobileBuild = process.env.CAPACITOR_BUILD === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isMobileBuild ? "export" : undefined,
  transpilePackages: ["@mrtpvrest/config", "@mrtpvrest/types"],
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "**.cloudinary.com" },
      { protocol: "https", hostname: "**" },
    ],
  },
  turbopack: {
    root: path.resolve(appDir, "../.."),
  },
  trailingSlash: true,
};

export default nextConfig;
