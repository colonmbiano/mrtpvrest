import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://master-burguers-production.up.railway.app";

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    // LEER DINÁMICAMENTE (SaaS Mode)
    // Estos valores se guardarán cuando el cliente inicie sesión o configure su sucursal
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
