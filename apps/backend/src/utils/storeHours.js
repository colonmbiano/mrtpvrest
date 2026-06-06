// ─────────────────────────────────────────────────────────────────────────────
// storeHours.js — Cálculo del estado abierta/cerrada de la tienda.
//
// Modelo de decisión (de mayor a menor prioridad):
//   1. isOpen === false        → CERRADA siempre (override manual "forzar cerrado").
//   2. scheduleEnabled === false → ABIERTA siempre (modo manual histórico).
//   3. scheduleEnabled === true  → se calcula con la hora local (timezone) contra
//                                  businessHours (una franja por día de semana).
//
// businessHours es un JSON serializado: una entrada por día (0=Dom … 6=Sáb):
//   [{ "day":1, "enabled":true, "open":"09:00", "close":"22:00" }, ...]
//
// Soporta franjas que cruzan medianoche (open > close, p.ej. 18:00 → 02:00),
// incluyendo el "arrastre" a la madrugada del día siguiente.
//
// Usa Intl (IANA tz database, soporta horario de verano) sin dependencias extra.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TZ = 'America/Mexico_City';

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const DAY_NAMES_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// "HH:mm" → minutos desde medianoche, o null si es inválido.
function toMinutes(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

// Día de semana (0-6) y minutos del día en la zona horaria indicada.
function localNow(now, timeZone) {
  const opts = { hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' };
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone, ...opts }).formatToParts(now);
  } catch {
    // Zona horaria inválida → caemos a la hora del servidor para no romper.
    parts = new Intl.DateTimeFormat('en-US', opts).formatToParts(now);
  }
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const day = WEEKDAY_INDEX[get('weekday')] ?? 0;
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0; // algunos entornos devuelven "24" a medianoche
  const minute = parseInt(get('minute'), 10);
  return { day, minutes: hour * 60 + minute };
}

function entryFor(schedule, day) {
  return schedule.find((e) => Number(e.day) === day) || null;
}

// ¿`minutes` cae dentro de [open, close)? Soporta franjas nocturnas (open>close)
// y open===close se interpreta como 24 horas.
function isWithin(minutes, open, close) {
  if (open == null || close == null) return false;
  if (open === close) return true;
  if (open < close) return minutes >= open && minutes < close;
  return minutes >= open || minutes < close; // cruza medianoche
}

function isOpenNow(schedule, day, minutes) {
  const today = entryFor(schedule, day);
  if (today && today.enabled) {
    if (isWithin(minutes, toMinutes(today.open), toMinutes(today.close))) return true;
  }
  // Arrastre: una franja nocturna de AYER que sigue activa en la madrugada de hoy.
  const yDay = (day + 6) % 7;
  const yest = entryFor(schedule, yDay);
  if (yest && yest.enabled) {
    const o = toMinutes(yest.open);
    const c = toMinutes(yest.close);
    if (o != null && c != null && o > c && minutes < c) return true;
  }
  return false;
}

// Próxima apertura buscando en los siguientes 7 días. Devuelve { offset, day, open }.
function findNextOpen(schedule, day, minutes) {
  for (let offset = 0; offset <= 7; offset++) {
    const d = (day + offset) % 7;
    const e = entryFor(schedule, d);
    if (!e || !e.enabled) continue;
    const o = toMinutes(e.open);
    if (o == null) continue;
    if (offset === 0 && o <= minutes) continue; // la apertura de hoy ya pasó
    return { offset, day: d, open: e.open };
  }
  return null;
}

function describeNextOpen(next) {
  if (!next) return null;
  let when;
  if (next.offset === 0) when = 'hoy';
  else if (next.offset === 1) when = 'mañana';
  else when = `el ${DAY_NAMES_ES[next.day]}`;
  return `Cerrado por horario. Abrimos ${when} a las ${next.open}.`;
}

/**
 * Calcula el estado de la tienda.
 * @param {object|null} config - RestaurantConfig (isOpen, scheduleEnabled, timezone, businessHours, closedMessage).
 * @param {Date} [now] - momento de evaluación (inyectable para tests).
 * @returns {{ isOpen: boolean, message: string|null, nextOpen: object|null }}
 *   message: SOLO se rellena cuando la tienda cierra por horario (mensaje dinámico).
 *   En el cierre manual (override) message es null → el llamador usa closedMessage.
 */
function computeOpenState(config, now = new Date()) {
  // 1. Override manual: forzar cerrado.
  if (!config || config.isOpen === false) {
    return { isOpen: false, message: null, nextOpen: null };
  }
  // 2. Modo manual (sin horario automático) → abierta.
  if (!config.scheduleEnabled) {
    return { isOpen: true, message: null, nextOpen: null };
  }
  // 3. Horario automático.
  let schedule = [];
  try {
    schedule = JSON.parse(config.businessHours || '[]');
  } catch {
    schedule = [];
  }
  // Horario activado pero sin configurar → no bloqueamos (evita cerrar por error).
  if (!Array.isArray(schedule) || schedule.length === 0) {
    return { isOpen: true, message: null, nextOpen: null };
  }
  const tz = config.timezone || DEFAULT_TZ;
  const { day, minutes } = localNow(now, tz);
  if (isOpenNow(schedule, day, minutes)) {
    return { isOpen: true, message: null, nextOpen: null };
  }
  const next = findNextOpen(schedule, day, minutes);
  return { isOpen: false, message: describeNextOpen(next), nextOpen: next };
}

module.exports = { computeOpenState, toMinutes, isOpenNow, localNow };
