import axios from "axios";
import { getApiUrl } from "@/lib/config";

// La baseURL se resuelve en cada request (no en módulo-load) para que cambios
// desde /setup o desde la config remota se apliquen sin reiniciar la app.
const api = axios.create();

api.interceptors.request.use((config) => {
  config.baseURL = getApiUrl();

  if (typeof window !== "undefined") {
    // LEER DINÁMICAMENTE (SaaS Mode)
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
    // Si el error es por falta de IDs, podríamos redirigir a una página de "Setup"
    return Promise.reject(error);
  }
);

export default api;
