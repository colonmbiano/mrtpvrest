import axios from "axios";
import { getApiUrl } from "@/lib/config";

const api = axios.create({ baseURL: getApiUrl() });
const devRestaurantId = "cmp53hjwh00061qo7vx9usdfn";
const devLocationId = "cmp53hk1l00081qo7gqdsxjsb";

api.interceptors.request.use((config) => {
  config.baseURL = getApiUrl();

  if (typeof window !== "undefined") {
    const storedRestaurantId =
      localStorage.getItem("restaurantId") ||
      localStorage.getItem("activeRestaurantId");
    const storedLocationId =
      localStorage.getItem("locationId") ||
      localStorage.getItem("activeLocationId");
    const restaurantId =
      storedRestaurantId || (process.env.NODE_ENV !== "production" ? devRestaurantId : null);
    const locationId =
      storedLocationId || (process.env.NODE_ENV !== "production" ? devLocationId : null);
    const employeeToken = localStorage.getItem("tpv-employee-token");
    const token =
      employeeToken ||
      sessionStorage.getItem("tpv-access-token") ||
      localStorage.getItem("accessToken");
    const url = String(config.url ?? "");
    const isEmployeeLogin = url.includes("/api/employees/login");
    const tenantOptional =
      url.includes("/api/auth/login") ||
      url.includes("/api/workspaces/me") ||
      url.includes("/api/locations/") ||
      isEmployeeLogin;

    if (!restaurantId) {
      if (tenantOptional) {
        if (token && !isEmployeeLogin) config.headers.Authorization = `Bearer ${token}`;
        return config;
      }
      throw new Error("TENANT_REQUIRED: falta x-restaurant-id en este dispositivo.");
    }

    config.headers["x-restaurant-id"] = restaurantId;
    if (locationId) config.headers["x-location-id"] = locationId;
    if (token && !isEmployeeLogin) config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== "undefined" && error?.response?.status === 401) {
      sessionStorage.removeItem("tpv-access-token");
      localStorage.removeItem("tpv-employee-token");
      localStorage.removeItem("currentEmployeeId");
      localStorage.removeItem("currentEmployeeName");
      localStorage.removeItem("currentEmployeeRole");
    }
    return Promise.reject(error);
  },
);

export default api;
