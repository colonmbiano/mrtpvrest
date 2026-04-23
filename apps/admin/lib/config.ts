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

export function getSaasUrl(): string {
  const url = process.env.NEXT_PUBLIC_SAAS_URL;
  if (url) return url;
  if (process.env.NODE_ENV === "production") {
    return "https://saas.mrtpvrest.com";
  }
  return "http://localhost:3005";
}
