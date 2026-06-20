// Acceso centralizado a env. NEXT_PUBLIC_* se inyectan en build. Lanzamos en
// tiempo de llamada (no al evaluar el módulo) para no romper el build cuando
// la env falta.

export function getApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_API_URL no está definida. Configúrala en Vercel o en apps/retail-admin/.env.local para dev local.",
    );
  }
  return url;
}
