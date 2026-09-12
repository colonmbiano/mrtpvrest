import { protectedStorage } from "./protected-storage";

const SECURE_KEY = "tpv-jwt";
const LEGACY_KEYS = ["accessToken", "tpv-employee-token"];
let memoryToken: string | null = null;
let readyPromise: Promise<void> | null = null;
let revision = 0;

function legacyToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("tpv-access-token") ||
    LEGACY_KEYS.map((key) => localStorage.getItem(key)).find(Boolean) || null;
}

function clearLegacy() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("tpv-access-token");
  LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
}

function storageFailed() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("tokki-storage-error"));
}

export function initTokenVault(): Promise<void> {
  if (readyPromise) return readyPromise;
  const startedAt = revision;
  readyPromise = (async () => {
    try {
      const secure = await protectedStorage.getItem(SECURE_KEY);
      if (revision !== startedAt) return;
      const legacy = legacyToken();
      memoryToken = secure || legacy;
      if (!secure && legacy) await protectedStorage.setItem(SECURE_KEY, legacy);
      clearLegacy();
    } catch { storageFailed(); }
  })();
  return readyPromise;
}

export async function getToken(): Promise<string | null> {
  await initTokenVault();
  return memoryToken;
}

export function getTokenSync(): string | null { return memoryToken; }

export async function setToken(token: string | null): Promise<void> {
  // Un logout o cambio de empleado gana frente a una lectura vieja del puente.
  const initialization = initTokenVault();
  const writeRevision = ++revision;
  memoryToken = token;
  clearLegacy();
  await initialization;
  if (writeRevision !== revision) return;
  try {
    if (token) await protectedStorage.setItem(SECURE_KEY, token);
    else await protectedStorage.removeItem(SECURE_KEY);
  } catch { storageFailed(); }
}

export function __resetTokenVaultForTests(): void {
  memoryToken = null; readyPromise = null; revision = 0;
}
