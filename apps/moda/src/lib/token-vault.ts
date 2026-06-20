// Bóveda del JWT del empleado. Versión web/APK-debug: memoria + localStorage.
// (El TPV usa Android Keystore vía capacitor-secure-storage-plugin; cuando MODA+
// tenga APK release se puede migrar a ese plugin manteniendo esta misma interfaz.)

const KEY = "moda-token";
let memoryToken: string | null = null;

export function getToken(): string | null {
  if (memoryToken) return memoryToken;
  if (typeof window !== "undefined") {
    memoryToken = localStorage.getItem(KEY);
  }
  return memoryToken;
}

export function setToken(token: string | null): void {
  memoryToken = token;
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(KEY, token);
  else localStorage.removeItem(KEY);
}

export function clearToken(): void {
  setToken(null);
}
