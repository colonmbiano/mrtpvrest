import axios from "axios";

// Cambiamos a dinámico para usar localhost en desarrollo o la URL de producción
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const api = axios.create({ baseURL: API_URL });

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
      // Si el repartidor no está configurado, lo mandamos al setup
      if (!localStorage.getItem("restaurantId")) {
        window.location.href = "/setup";
      } else {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("user");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
