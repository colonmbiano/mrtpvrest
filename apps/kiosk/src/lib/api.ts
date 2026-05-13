import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.mrtpvrest.com";

function headers() {
  if (typeof window === "undefined") return {};
  const h: Record<string, string> = {};
  const rid = localStorage.getItem("kiosk-restaurant-id");
  const lid = localStorage.getItem("kiosk-location-id");
  const tid = localStorage.getItem("kiosk-terminal-id");
  if (rid) h["x-restaurant-id"] = rid;
  if (lid) h["x-location-id"]   = lid;
  if (tid) h["x-kiosk-terminal-id"] = tid;
  return h;
}

const api = axios.create({ baseURL: API_URL });
api.interceptors.request.use((config) => {
  config.headers = { ...config.headers, ...headers() } as any;
  return config;
});

export default api;
