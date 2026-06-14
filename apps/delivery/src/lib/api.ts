import axios from "axios";
import { getApiUrl } from "./config";

const api = axios.create({ baseURL: getApiUrl() });

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    // 1. Obtener contexto SaaS del LocalStorage
    const restaurantId = localStorage.getItem("restaurantId");
    const locationId = localStorage.getItem("locationId");
    const token = localStorage.getItem("accessToken");

    // 2. Inyectar Headers obligatorios para el SaaS
    if (restaurantId) config.headers['x-restaurant-id'] = restaurantId;
    if (locationId) config.headers['x-location-id'] = locationId;

    // 3. Inyectar Token de Repartidor
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      // Unificado: NO mandamos a /setup (IDs crudos) ni a /login (no es ruta, es
      // pantalla por estado). El enrutado lo decide page.tsx desde la home:
      // SetupScreen si no hay restaurantId/locationId, teclado de PIN si ya están.
      const hadToken = !!localStorage.getItem("accessToken");
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
      // Si HABÍA sesión y expiró, recargamos la home para volver al PIN/SetupScreen.
      // Si NO había token (fetch de arranque sin sesión), no recargamos: la pantalla
      // correcta ya se muestra y así evitamos un loop de recarga.
      if (hadToken) {
        window.location.href = "/";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
