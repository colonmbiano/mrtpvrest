// Identificador de invitado estable por navegador (cabecera X-Guest-Id del marketplace).
// Se guarda en localStorage para que cotización, orden y seguimiento compartan la misma sesión.
// Si el almacenamiento no está disponible (modo privado, bloqueado por el navegador), se mantiene
// en memoria durante la carga de la página. No es una credencial: el backend lo trata solo como
// manejador de sesión de invitado.

export const GUEST_ID_STORAGE_KEY = 'mrtpv:marketplace-guest-id';
const GUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;

export type GuestStorage = Pick<Storage, 'getItem' | 'setItem'>;

let memoryGuestId: string | null = null;

// crypto.randomUUID solo existe en contextos seguros; getRandomValues funciona en todos.
export function randomHexId(bytes = 16): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function isGuestId(value: unknown): value is string {
  return typeof value === 'string' && GUEST_ID_RE.test(value);
}

function browserStorage(): GuestStorage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    // Acceder a localStorage puede lanzar cuando el navegador lo bloquea.
    return null;
  }
}

export function getOrCreateGuestId(storage: GuestStorage | null = browserStorage()): string {
  if (storage) {
    try {
      const stored = storage.getItem(GUEST_ID_STORAGE_KEY);
      if (isGuestId(stored)) return stored;
      const created = randomHexId();
      storage.setItem(GUEST_ID_STORAGE_KEY, created);
      return created;
    } catch {
      // Lectura o escritura fallida: se usa la copia en memoria.
    }
  }
  if (!isGuestId(memoryGuestId)) memoryGuestId = randomHexId();
  return memoryGuestId;
}
