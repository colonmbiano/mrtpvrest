/**
 * token-vault.ts — almacenamiento del JWT del TPV.
 *
 * APK con el plugin nativo: el token vive en secure storage
 * (EncryptedSharedPreferences respaldado por Android Keystore) + un cache en
 * memoria para lecturas síncronas. Las llaves legacy de localStorage/
 * sessionStorage se migran y se limpian.
 *
 * Web (pnpm dev) y APKs viejos sin el plugin (el OTA entrega este JS antes de
 * que se renueve el APK): fallback transparente al comportamiento legacy —
 * sessionStorage `tpv-access-token` + localStorage `accessToken` /
 * `tpv-employee-token`, exactamente las mismas llaves de siempre.
 *
 * Modelo de amenaza: el secure storage protege el token EN REPOSO (forense,
 * adb backup, otras apps en dispositivos rooteados). No protege contra XSS
 * dentro del WebView — cualquier JS del contexto puede llamar al plugin
 * igual que podía leer localStorage.
 */
import { Capacitor } from "@capacitor/core";

const SECURE_KEY = "tpv-jwt";
const LEGACY_SESSION_KEY = "tpv-access-token";
const LEGACY_LOCAL_KEYS = ["accessToken", "tpv-employee-token"] as const;

type SecurePlugin = {
  get(opts: { key: string }): Promise<{ value: string }>;
  set(opts: { key: string; value: string }): Promise<unknown>;
  remove(opts: { key: string }): Promise<unknown>;
};

let memoryToken: string | null = null;
let plugin: SecurePlugin | null = null;
let readyPromise: Promise<void> | null = null;

function readLegacy(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return (
      sessionStorage.getItem(LEGACY_SESSION_KEY) ||
      localStorage.getItem(LEGACY_LOCAL_KEYS[0]) ||
      localStorage.getItem(LEGACY_LOCAL_KEYS[1])
    );
  } catch {
    return null;
  }
}

function writeLegacy(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) {
      sessionStorage.setItem(LEGACY_SESSION_KEY, token);
      for (const k of LEGACY_LOCAL_KEYS) localStorage.setItem(k, token);
    } else {
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
      for (const k of LEGACY_LOCAL_KEYS) localStorage.removeItem(k);
    }
  } catch {
    /* storage lleno o bloqueado: el token sigue en memoria */
  }
}

function clearLegacy(): void {
  writeLegacy(null);
}

/**
 * Idempotente. Hidrata el cache en memoria (legacy primero, para que las
 * lecturas síncronas funcionen desde el primer tick) y, si el APK trae el
 * plugin, carga/migra el token al secure storage y limpia las llaves legacy.
 */
export function initTokenVault(): Promise<void> {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    memoryToken = readLegacy();
    if (typeof window === "undefined") return;
    if (!Capacitor.isNativePlatform()) return;
    if (!Capacitor.isPluginAvailable("SecureStoragePlugin")) return; // APK viejo
    try {
      const mod = await import("capacitor-secure-storage-plugin");
      plugin = mod.SecureStoragePlugin as unknown as SecurePlugin;

      let secure: string | null = null;
      try {
        secure = (await plugin.get({ key: SECURE_KEY })).value || null;
      } catch {
        secure = null; // el plugin rechaza cuando la key no existe
      }

      if (secure) {
        memoryToken = secure;
        clearLegacy(); // un bundle viejo pudo re-escribirlas
      } else if (memoryToken) {
        // Migración única: el token legacy pasa al Keystore.
        await plugin.set({ key: SECURE_KEY, value: memoryToken });
        clearLegacy();
      }
    } catch {
      plugin = null; // cualquier fallo del plugin → seguimos en legacy
    }
  })();
  return readyPromise;
}

/** Lectura async (espera la hidratación). Úsala donde se pueda await. */
export async function getToken(): Promise<string | null> {
  await initTokenVault();
  return memoryToken ?? readLegacy();
}

/**
 * Lectura síncrona para call sites que no pueden await. Antes de que termine
 * initTokenVault puede devolver el legacy (o null en el primer arranque
 * nativo); el interceptor de api.ts usa la versión async.
 */
export function getTokenSync(): string | null {
  return memoryToken ?? readLegacy();
}

/**
 * Persiste (o limpia, con null) el token. El cache en memoria y las llaves
 * legacy se actualizan SÍNCRONAMENTE — cualquier request o assertion
 * inmediatamente posterior ya ve el valor nuevo. En APK con plugin, el token
 * pasa al Keystore y las llaves legacy se limpian al completar la escritura.
 */
export async function setToken(token: string | null): Promise<void> {
  memoryToken = token;
  writeLegacy(token); // web y APK viejo quedan correctos desde este tick
  await initTokenVault();
  if (plugin) {
    try {
      if (token) await plugin.set({ key: SECURE_KEY, value: token });
      else await plugin.remove({ key: SECURE_KEY });
      clearLegacy();
    } catch {
      /* plugin falló en runtime → el token ya quedó en legacy */
    }
  }
}

/** Solo para tests: resetea el estado del módulo. */
export function __resetTokenVaultForTests(): void {
  memoryToken = null;
  plugin = null;
  readyPromise = null;
}
