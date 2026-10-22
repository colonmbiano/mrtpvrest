// Acceso centralizado al env. NEXT_PUBLIC_* se inlinea al build, así que estas
// lecturas se resuelven a literales en el bundle.

// Backend canónico de producción. Es un valor PÚBLICO (se expone al navegador) y
// compartido por todo el sistema: TPV, meseros-lite y el storefront pegan al
// mismo backend multi-tenant (cada tienda se resuelve por slug, no por host).
const DEFAULT_PROD_API_URL = "https://api.mrtpvrest.com";

// Destino deliberadamente inalcanzable (puerto 9 = discard en loopback). En modo
// aislado una configuración ausente o inválida apunta aquí: las llamadas fallan
// de forma visible en vez de caer en producción.
export const BLOCKED_API_URL = "http://127.0.0.1:9";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

// Copia local del marketplace (ver MARKETPLACE-STAGING.md). Se fija junto con
// MARKETPLACE_ISOLATED del backend.
export function isMarketplaceIsolated(): boolean {
  return process.env.NEXT_PUBLIC_MARKETPLACE_ISOLATED === "true";
}

// La raíz muestra el catálogo solo cuando se pide explícitamente; sin ninguna
// bandera conserva la redirección histórica del storefront productivo.
export function isMarketplaceCatalogEnabled(): boolean {
  return isMarketplaceIsolated() || process.env.NEXT_PUBLIC_MARKETPLACE_CATALOG === "true";
}

// Normaliza a origen exacto (sin path, query ni credenciales) o null.
export function parseOrigin(raw: string | undefined, { loopbackOnly }: { loopbackOnly: boolean }): string | null {
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/") return null;
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (loopbackOnly && !loopback) return null;
  // Fuera de loopback no se acepta texto plano.
  if (!loopback && url.protocol !== "https:") return null;
  return url.origin;
}

function explicitApiUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_API_URL || process.env.API_URL;
}

// API del catálogo global: SIEMPRE configuración explícita, nunca el default
// productivo. null = falta configurar; la portada lo muestra como error.
export function getMarketplaceApiUrl(): string | null {
  return parseOrigin(explicitApiUrl(), { loopbackOnly: isMarketplaceIsolated() });
}

export function getApiUrl(): string {
  if (isMarketplaceIsolated()) return getMarketplaceApiUrl() ?? BLOCKED_API_URL;
  const url = explicitApiUrl();
  if (url) return url;
  // El env tiene prioridad (apuntar a staging/otro backend). Si falta, en
  // producción caemos al backend canónico en vez de lanzar: antes el throw
  // tumbaba el build ENTERO del storefront cuando el env no estaba en Vercel
  // ("Failed to collect page data for /[slug]"). Un default público y correcto
  // es preferible a un build roto; quien quiera otro backend, setea el env.
  if (process.env.NODE_ENV === "production") return DEFAULT_PROD_API_URL;
  return "http://localhost:3001";
}

// URL pública de una tienda para metadata (OG/canonical). En el marketplace la
// tienda vive en el mismo origen (/<slug>), nunca en el subdominio productivo;
// sin NEXT_PUBLIC_SITE_URL válido devuelve null y se omite la URL absoluta.
export function getStorePublicUrl(slug: string): string | null {
  if (!isMarketplaceCatalogEnabled()) return `https://${slug}.mrtpvrest.com`;
  const site = parseOrigin(process.env.NEXT_PUBLIC_SITE_URL, { loopbackOnly: isMarketplaceIsolated() });
  return site ? `${site}/${encodeURIComponent(slug)}` : null;
}
