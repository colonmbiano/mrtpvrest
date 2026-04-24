import axios from "axios";
import { getApiUrl } from "./config";

// En el browser usamos paths relativos ("") para que pasen por el rewrite
// de next.config.js (same-origin, sin CORS). En SSR/Node seguimos usando la
// URL absoluta porque no hay proxy.
const baseURL =
  typeof window === "undefined" ? getApiUrl() : "";

const api = axios.create({ baseURL });

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
