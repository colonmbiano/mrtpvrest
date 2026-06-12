import { getTokenSync, setToken } from "@/lib/token-vault";

export function getUser() {
  if (typeof window === "undefined") return null;
  try {
    const u = localStorage.getItem("user");
    return u ? JSON.parse(u) : null;
  } catch { return null; }
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return getTokenSync();
}

export function logout() {
  // vault limpia secure storage + llaves legacy del token.
  void setToken(null);
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("user");
  localStorage.removeItem("restaurantId");
  localStorage.removeItem("restaurantName");
  localStorage.removeItem("locationId");
  localStorage.removeItem("locationName");
  window.location.href = "/";
}

export function isAdmin() {
  const u = getUser();
  return u?.role === "ADMIN";
}
