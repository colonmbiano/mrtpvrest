export interface RetailAdminUser {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  restaurantId?: string | null;
}

export interface RetailLocation {
  id: string;
  name: string;
  businessType?: string | null;
  isCentralWarehouse?: boolean;
}

export function getUser(): RetailAdminUser | null {
  if (typeof window === "undefined") return null;
  try {
    const u = localStorage.getItem("user");
    return u ? (JSON.parse(u) as RetailAdminUser) : null;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
}

export function isAuthed(): boolean {
  return Boolean(getToken() && localStorage.getItem("restaurantId"));
}

export function logout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("user");
  localStorage.removeItem("restaurantId");
  localStorage.removeItem("locationId");
  window.location.href = "/login";
}
