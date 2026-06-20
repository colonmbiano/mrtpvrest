import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const isMobileBuild = process.env.CAPACITOR_BUILD === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isMobileBuild ? "export" : undefined,
  images: { unoptimized: true },
  turbopack: { root: path.resolve(appDir, "../..") },
  trailingSlash: true,
};

export default nextConfig;
