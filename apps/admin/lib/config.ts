// Centralized env access. NEXT_PUBLIC_* are inlined at build time by Next.js,
// so these reads resolve to literals in the emitted bundle. We throw at call
// time (not module-eval time) so a missing env does not break the build step.

export function getApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Configure it in the deployment environment (Vercel) or in apps/admin/.env.local for local dev."
    );
  }
  return url;
}

export function getStoreBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_STORE_URL;
  if (url) return url.replace(/\/+$/, "");
  return "https://mrtpvrest.com";
}

// Construye la URL pública del storefront para un slug de tienda.
// En producción las tiendas se sirven por SUBDOMINIO: https://{slug}.mrtpvrest.com
// (el middleware de apps/client reescribe {slug}.mrtpvrest.com -> /[slug]).
//
// Overrides:
//   - NEXT_PUBLIC_STORE_URL: base completa en modo PATH (ej. dev http://localhost:3003
//     -> http://localhost:3003/{slug}). Tiene prioridad; util en local donde no hay
//     wildcard DNS.
//   - NEXT_PUBLIC_STORE_DOMAIN: dominio base para el subdominio (default "mrtpvrest.com").
export function getStoreUrl(slug: string): string {
  if (!slug) return "";
  const explicit = process.env.NEXT_PUBLIC_STORE_URL;
  if (explicit) return `${explicit.replace(/\/+$/, "")}/${slug}`;
  const domain = (process.env.NEXT_PUBLIC_STORE_DOMAIN || "mrtpvrest.com")
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  return `https://${slug}.${domain}`;
}

export function getSaasUrl(): string {
  const url = process.env.NEXT_PUBLIC_SAAS_URL;
  if (url) return url;
  if (process.env.NODE_ENV === "production") {
    return "https://saas.mrtpvrest.com";
  }
  return "http://localhost:3005";
}
