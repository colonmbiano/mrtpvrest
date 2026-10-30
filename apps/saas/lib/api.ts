import axios from "axios";

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

const API_URL = isolatedApiUrl() ?? (process.env.NEXT_PUBLIC_API_URL || "https://api.mrtpvrest.com");

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");
    const restaurantId = localStorage.getItem("restaurantId");
    const locationId = localStorage.getItem("locationId");

    if (token) config.headers.Authorization = `Bearer ${token}`;

    // Inyectar contexto SaaS Multi-tenant y Multi-sucursal
    if (restaurantId) config.headers['x-restaurant-id'] = restaurantId;
    if (locationId) config.headers['x-location-id'] = locationId;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      if (!window.location.pathname.includes('/login')) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("user");
        document.cookie = "mb-role=; path=/; max-age=0; SameSite=Lax";
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
