// ─────────────────────────────────────────────────────────────────────────────
// dayRange.js — Rango [from, to] de un día NATURAL en una zona horaria (IANA),
// devuelto como Date en UTC para usar directo en filtros de Prisma.
//
// Por qué existe: el backend corre en UTC (Railway). Usar `new Date().setHours(
// 0,0,0,0)` parte el día a las 18:00 de México, así que las ventas de la tarde
// caían en el "día anterior" y desaparecían de cortes y reportes "de hoy".
//
// Usa Intl (IANA tz database, soporta horario de verano) sin dependencias extra,
// mismo enfoque que utils/storeHours.js.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TZ = 'America/Mexico_City';

// Componentes de fecha/hora de `date` tal como se ven en `timeZone`.
function partsInTz(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const { type, value } of fmt.formatToParts(date)) p[type] = value;
  let hour = parseInt(p.hour, 10);
  if (hour === 24) hour = 0; // algunos entornos devuelven "24" a medianoche
  return {
    year: parseInt(p.year, 10), month: parseInt(p.month, 10), day: parseInt(p.day, 10),
    hour, minute: parseInt(p.minute, 10), second: parseInt(p.second, 10),
  };
}

// Offset (ms) de la zona respecto a UTC en el instante `date`.
// Positivo si la zona va por delante de UTC.
function tzOffsetMs(date, timeZone) {
  const p = partsInTz(date, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - date.getTime();
}

// Instante UTC de la medianoche local del día que contiene `ref` en `timeZone`.
function startOfLocalDay(ref, timeZone = DEFAULT_TZ) {
  const p = partsInTz(ref, timeZone);
  const localMidnightAsUTC = Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0);
  return new Date(localMidnightAsUTC - tzOffsetMs(ref, timeZone));
}

// Rango de un día natural en `timeZone`, como Dates UTC listas para Prisma.
//
//   localDayRange()                        → hoy (zona por defecto)
//   localDayRange('2026-06-10')            → ese día en la zona por defecto
//   localDayRange(dateStr, 'Europe/Madrid')
//
// Devuelve { from, to } donde `from` es la medianoche local y `to` es el último
// milisegundo del día (23:59:59.999 local). Úsalo como `{ gte: from, lte: to }`.
function localDayRange(dateStr, timeZone = DEFAULT_TZ) {
  let ref;
  if (dateStr) {
    const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    // Anclamos al mediodía local para evitar bordes de cambio de horario.
    ref = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12, 0, 0)) : new Date(dateStr);
  } else {
    ref = new Date();
  }
  const from = startOfLocalDay(ref, timeZone);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { from, to };
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Día de la semana (0=domingo … 6=sábado) tal como se ve en `timeZone`.
function localWeekday(date, timeZone = DEFAULT_TZ) {
  const short = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short);
}

// Instante UTC de la medianoche del LUNES de la semana que contiene `ref`.
// La semana corre lunes→domingo (convención de los cortes semanales).
// Anclamos el salto al mediodía para no tropezar con el horario de verano.
function startOfLocalWeek(ref, timeZone = DEFAULT_TZ) {
  const daysSinceMonday = (localWeekday(ref, timeZone) + 6) % 7;
  const monday = new Date(
    startOfLocalDay(ref, timeZone).getTime() - daysSinceMonday * DAY_MS + 12 * 60 * 60 * 1000
  );
  return startOfLocalDay(monday, timeZone);
}

module.exports = { localDayRange, startOfLocalDay, startOfLocalWeek, localWeekday, DEFAULT_TZ };
