export function getUser() {
  if (typeof window === "undefined") return null;
  try {
    const u = localStorage.getItem("user");
    return u ? JSON.parse(u) : null;
  } catch { return null; }
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
}

export function logout() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("user");
  localStorage.removeItem("mb-role");
  document.cookie = "mb-role=; path=/; max-age=0; SameSite=Lax";
  window.location.href = "/login";
}

export function isAdmin() {
  const u = getUser();
  return u?.role === "ADMIN";
}

export function isSuperAdmin() {
  const u = getUser();
  return u?.role === "SUPER_ADMIN";
}
