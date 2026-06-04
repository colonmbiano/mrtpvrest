/**
 * errors.ts
 * Normaliza cualquier error (axios, Error nativo, objeto crudo del backend) a
 * un string legible para mostrar en alert/toast. Evita el clásico
 * "[object Object]" cuando el backend devuelve `error` como objeto.
 */
export function extractErrorMessage(err: any, fallback = "Ocurrió un error"): string {
  // Posibles ubicaciones del mensaje, de la más específica a la más genérica.
  const candidate =
    err?.response?.data?.error ??
    err?.response?.data?.message ??
    err?.response?.data ??
    err;

  if (typeof candidate === "string" && candidate.trim()) return candidate;

  // El backend a veces anida { error: { message } } o { error: "..." }.
  if (candidate && typeof candidate === "object") {
    if (typeof candidate.error === "string" && candidate.error.trim()) return candidate.error;
    if (typeof candidate.message === "string" && candidate.message.trim()) return candidate.message;
  }

  if (typeof err?.message === "string" && err.message.trim()) return err.message;

  // Último recurso: serializar para no perder la información en un [object Object].
  try {
    const s = JSON.stringify(candidate);
    if (s && s !== "{}" && s !== "null") return s;
  } catch {
    /* ignore */
  }

  return fallback;
}
