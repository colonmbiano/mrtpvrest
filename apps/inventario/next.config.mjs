import path from "node:path";
import { fileURLToPath } from "node:url";

const isMobileBuild = process.env.CAPACITOR_BUILD === "true";
const appDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
  turbopack: {
    root: path.resolve(appDir, "../.."),
  },
  output: isMobileBuild ? "export" : undefined,
  trailingSlash: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "**.cloudinary.com" },
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
