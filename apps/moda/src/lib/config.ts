// Resolución de la URL del backend para MRTPV Retail.
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

// Copia aislada del marketplace (NEXT_PUBLIC_MARKETPLACE_ISOLATED=true, ver
// MARKETPLACE-STAGING.md): solo vale la API loopback horneada; se ignoran el
// override de localStorage y FALLBACK. Sin URL loopback válida, destino bloqueado.
export const BLOCKED_API_URL = "http://127.0.0.1:9";

export function isolatedApiUrl(): string | null {
  if (process.env.NEXT_PUBLIC_MARKETPLACE_ISOLATED !== "true") return null;
  try {
    const u = new URL(process.env.NEXT_PUBLIC_API_URL || "");
    const loopback = u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]";
    return loopback && (u.protocol === "http:" || u.protocol === "https:") ? u.origin : BLOCKED_API_URL;
  } catch {
    return BLOCKED_API_URL;
  }
}

export function getApiUrl(): string {
  const isolated = isolatedApiUrl();
  if (isolated) return isolated;
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
