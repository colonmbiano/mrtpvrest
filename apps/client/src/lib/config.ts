// Acceso centralizado al env. NEXT_PUBLIC_* se inlinea al build, así que estas
// lecturas se resuelven a literales en el bundle. El throw va dentro de la
// función (no a nivel módulo) para no romper el build cuando falta el env.

export function getApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL;
  if (url) return url;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Configure it in the deployment environment (Vercel) or in apps/client/.env.local for local dev."
    );
  }
  return "http://localhost:3001";
}
