// Axios singleton para el KDS app independiente.
// Inyecta accessToken (JWT del Device o User) + headers de tenant.
import axios from "axios";

const DEFAULT_API_URL = "https://api.mrtpvrest.com";

export function getApiUrl(): string {
  // Override manual via /setup → localStorage.apiBaseUrl
  if (typeof window !== "undefined") {
    const o = localStorage.getItem("apiBaseUrl");
    if (o && o.trim()) return o.trim();
  }
  return process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
}

const api = axios.create();

api.interceptors.request.use((config) => {
  config.baseURL = getApiUrl();
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");
    const restaurantId = localStorage.getItem("restaurantId");
    const locationId = localStorage.getItem("locationId");
    if (token) config.headers["Authorization"] = `Bearer ${token}`;
    if (restaurantId) config.headers["x-restaurant-id"] = restaurantId;
    if (locationId) config.headers["x-location-id"] = locationId;
  }
  return config;
});

export default api;
