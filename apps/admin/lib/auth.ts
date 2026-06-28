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

// ── Refresh token ──────────────────────────────────────────────────────────
// El refresh token decide cuánto vive la sesión (30 días en backend). Lo
// guardamos en localStorage cuando el usuario marca "mantener sesión iniciada"
// (persiste al cerrar el navegador) o en sessionStorage cuando no (se borra al
// cerrar el navegador, recomendado en equipos compartidos). Todo el código lee
// el refresh token por aquí, nunca con localStorage.getItem directo.
const REFRESH_KEY = "refreshToken";

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY) ?? sessionStorage.getItem(REFRESH_KEY);
}

export function setRefreshToken(token: string, remember: boolean) {
  if (typeof window === "undefined") return;
  // Limpiar ambos almacenes para no dejar copias contradictorias.
  localStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
  (remember ? localStorage : sessionStorage).setItem(REFRESH_KEY, token);
}

// Tras un /refresh el backend rota el token: lo reescribimos en el MISMO almacén
// que el usuario eligió al iniciar sesión (no cambiar persistencia a su espalda).
export function rotateRefreshToken(token: string) {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem(REFRESH_KEY) !== null) {
    sessionStorage.setItem(REFRESH_KEY, token);
  } else {
    localStorage.setItem(REFRESH_KEY, token);
  }
}

export function clearRefreshToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
}

export function logout() {
  localStorage.removeItem("accessToken");
  clearRefreshToken();
  localStorage.removeItem("user");
  localStorage.removeItem("mb-role");
  localStorage.removeItem("restaurantId");
  localStorage.removeItem("locationId");
  localStorage.removeItem("mb-accent");
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
