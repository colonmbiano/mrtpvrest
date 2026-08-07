// ───────────────────────────────────────────────────────────────────────────
// promo-window.ts — Evaluación CLIENTE de la ventana de promos del catálogo.
//
// El backend cobra con su propia zona horaria (server-side, autoritativo). Aquí
// solo decidimos qué precio PINTAR en la caja, contra el reloj del equipo — que
// físicamente está en el local, así que su hora local es la del restaurante. No
// hace falta convertir timezones en el cliente.
//
// La ventana efectiva llega ya resuelta del backend en promoWindowStart/End
// (override del item o corte global del restaurante). Si por algún cache viejo
// no vienen, caemos a los campos crudos promoStartTime/promoEndTime.
// ───────────────────────────────────────────────────────────────────────────

const DAY_NAMES = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

export interface PromoWindowLike {
  isPromo?: boolean;
  promoPrice?: number | null;
  activeDays?: string[];
  promoStartTime?: string | null;
  promoEndTime?: string | null;
  promoWindowStart?: string | null;
  promoWindowEnd?: string | null;
}

/** "HH:mm" del reloj local del equipo. */
function localHHmm(now: Date): string {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** ¿La hora `t` ("HH:mm") cae en la ventana [start, end]? Soporta ventanas que
 *  cruzan medianoche (start > end). Sin límites → siempre abierta. */
function withinDailyWindow(
  t: string,
  start: string | null,
  end: string | null,
): boolean {
  if (!start && !end) return true;
  if (!start) return t <= (end as string);
  if (!end) return t >= start;
  if (start <= end) return t >= start && t <= end;
  return t >= start || t <= end;
}

/**
 * ¿La promo de este producto aplica AHORA (día + hora, reloj local)? Solo tiene
 * sentido para items promo con precio; para el resto devuelve false.
 */
export function isPromoActiveNow(p: PromoWindowLike, now: Date = new Date()): boolean {
  if (!p?.isPromo || p.promoPrice == null) return false;

  const days = Array.isArray(p.activeDays) ? p.activeDays : [];
  const today: string = DAY_NAMES[now.getDay()]!; // getDay() ∈ 0..6 → siempre válido
  if (days.length > 0 && !days.includes(today)) return false;

  const start = p.promoWindowStart ?? p.promoStartTime ?? null;
  const end = p.promoWindowEnd ?? p.promoEndTime ?? null;
  return withinDailyWindow(localHHmm(now), start, end);
}
