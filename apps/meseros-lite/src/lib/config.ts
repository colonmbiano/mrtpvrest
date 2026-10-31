// Copia aislada del marketplace (NEXT_PUBLIC_MARKETPLACE_ISOLATED=true, ver
// MARKETPLACE-STAGING.md): solo vale la API loopback horneada, nunca producción.
// Sin URL loopback válida se usa un destino bloqueado para que el fallo sea visible.
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

export function getApiUrl() {
  return (
    isolatedApiUrl() ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    (typeof window !== "undefined" && window.location.protocol === "https:"
      ? "https://api.mrtpvrest.com"
      : "http://localhost:3001")
  );
}
