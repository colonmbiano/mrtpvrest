// Acceso centralizado al env. NEXT_PUBLIC_* se inlinea al build, así que estas
// lecturas se resuelven a literales en el bundle.

// Backend canónico de producción. Es un valor PÚBLICO (se expone al navegador) y
// compartido por todo el sistema: TPV, meseros-lite y el storefront pegan al
// mismo backend multi-tenant (cada tienda se resuelve por slug, no por host).
const DEFAULT_PROD_API_URL = "https://api.mrtpvrest.com";

export function getApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL;
  if (url) return url;
  // El env tiene prioridad (apuntar a staging/otro backend). Si falta, en
  // producción caemos al backend canónico en vez de lanzar: antes el throw
  // tumbaba el build ENTERO del storefront cuando el env no estaba en Vercel
  // ("Failed to collect page data for /[slug]"). Un default público y correcto
  // es preferible a un build roto; quien quiera otro backend, setea el env.
  if (process.env.NODE_ENV === "production") return DEFAULT_PROD_API_URL;
  return "http://localhost:3001";
}
