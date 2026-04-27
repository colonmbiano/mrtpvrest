export function getUser() {
  if (typeof window === "undefined") return null;
  try {
    const u = localStorage.getItem("user");
    return u ? JSON.parse(u) : null;
  } catch { return null; }
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken") || localStorage.getItem("tpv-employee-token");
}

export function logout() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("tpv-employee-token");
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
