import axios from "axios";
import { getApiUrl } from "@/lib/config";

const api = axios.create();

api.interceptors.request.use((config) => {
  config.baseURL = getApiUrl();

  if (typeof window !== "undefined") {
    const restaurantId = localStorage.getItem("restaurantId");
    const locationId = localStorage.getItem("locationId");
    const token = localStorage.getItem("accessToken");

    if (restaurantId) config.headers['x-restaurant-id'] = restaurantId;
    if (locationId) config.headers['x-location-id'] = locationId;
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (typeof window !== "undefined" && error?.response?.status === 401) {
      const url = String(error?.config?.url || "");
      const isPinLogin = url.includes("/api/employees/login");
      if (!isPinLogin && !window.location.pathname.startsWith("/setup")) {
        // NUNCA borrar restaurantId ni locationId, ni redirigir a /setup
        localStorage.removeItem("accessToken");
        localStorage.removeItem("tpv-employee-token");
        localStorage.removeItem("tpv-employee");
      }
    }
    return Promise.reject(error);
  }
);

export default api;
