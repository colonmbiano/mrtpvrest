export type BackendAvailability = "unknown" | "available" | "unavailable";

const DEFAULT_COOLDOWN_MS = 30_000;

let availability: BackendAvailability = "unknown";
let retryAfter = 0;
const listeners = new Set<() => void>();

function publish(next: BackendAvailability) {
  if (availability === next) return;
  availability = next;
  for (const listener of listeners) listener();
}
export function getBackendAvailability(): BackendAvailability {
  return availability;
}

export function subscribeBackendAvailability(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function markBackendAvailable(): void {
  retryAfter = 0;
  publish("available");
}

export function markBackendUnavailable(
  cooldownMs = DEFAULT_COOLDOWN_MS,
): void {
  retryAfter = Math.max(retryAfter, Date.now() + cooldownMs);
  publish("unavailable");
}

/**
 * Mientras el circuito está abierto las operaciones críticas se guardan
 * directamente en el outbox. Al terminar el cooldown se permite UNA prueba;
 * una respuesta correcta cierra el circuito y otro fallo vuelve a abrirlo.
 */
export function isBackendCircuitOpen(now = Date.now()): boolean {
  return availability === "unavailable" && now < retryAfter;
}

export function resetBackendAvailability(): void {
  retryAfter = 0;
  publish("unknown");
}
