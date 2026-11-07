import axios from "axios";
import { getApiUrl } from "./config";

const api = axios.create({ baseURL: getApiUrl() });

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");

    // Modo repartidor INDEPENDIENTE: Bearer de courier (red del marketplace), SIN
    // headers de tienda. Solo cuando no hay sesión de tienda (accessToken), para no
    // mezclar credenciales. Ver lib/courierSession.
    if (localStorage.getItem("deliveryMode") === "courier" && !token) {
      const courierToken = localStorage.getItem("courierToken");
      if (courierToken) config.headers.Authorization = `Bearer ${courierToken}`;
      return config;
    }

    // Modo tienda: contexto SaaS (x-restaurant-id/x-location-id) + token de empleado.
    const restaurantId = localStorage.getItem("restaurantId");
    const locationId = localStorage.getItem("locationId");
    if (restaurantId) config.headers['x-restaurant-id'] = restaurantId;
    if (locationId) config.headers['x-location-id'] = locationId;
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      // Modo courier: la sesión de red expiró o es inválida. Limpia el token y
      // vuelve al arranque (page.tsx mostrará el login de repartidor independiente).
      if (localStorage.getItem("deliveryMode") === "courier" && !localStorage.getItem("accessToken")) {
        const hadCourier = !!localStorage.getItem("courierToken");
        localStorage.removeItem("courierToken");
        localStorage.removeItem("courierTokenExp");
        localStorage.removeItem("deliveryMode");
        if (hadCourier) window.location.href = "/?modo=independiente";
        return Promise.reject(error);
      }
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
