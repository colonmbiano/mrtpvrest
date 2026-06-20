// Resolución de la URL del backend para MODA+.
// Orden: override en localStorage (configurado en /login) → NEXT_PUBLIC_API_URL
// (horneado en build) → fallback producción. Mismo criterio https-only del TPV:
// http solo se permite contra hosts privados (dev / LAN); todo lo demás se fuerza a https.

const FALLBACK = "https://api.mrtpvrest.com";
const API_KEY = "moda-api-url";

function isPrivateHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (hostname.startsWith("10.") || hostname.startsWith("192.168.")) return true;
  // 172.16.0.0 – 172.31.255.255
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  return false;
}

export function sanitizeApiUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    if (url.protocol === "http:" && !isPrivateHost(url.hostname)) {
      url.protocol = "https:";
    }
    return url.origin.replace(/\/+$/, "");
  } catch {
    return FALLBACK;
  }
}

export function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const override = localStorage.getItem(API_KEY) || localStorage.getItem("apiBaseUrl");
    if (override) return sanitizeApiUrl(override);
  }
  const env = process.env.NEXT_PUBLIC_API_URL;
  return (env || FALLBACK).replace(/\/+$/, "");
}

export function setApiUrl(url: string | null): void {
  if (typeof window === "undefined") return;
  if (url && url.trim()) localStorage.setItem(API_KEY, sanitizeApiUrl(url));
  else localStorage.removeItem(API_KEY);
}
