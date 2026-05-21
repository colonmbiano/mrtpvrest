export function getApiUrl() {
  return (
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    (typeof window !== "undefined" && window.location.protocol === "https:"
      ? "https://api.mrtpvrest.com"
      : "http://localhost:3001")
  );
}
