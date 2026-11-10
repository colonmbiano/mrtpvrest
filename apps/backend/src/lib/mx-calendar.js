'use strict';

// Calendario de la Ciudad de México para cortes de dinero (comisiones mensuales C5, pagos diarios
// al repartidor C8). Un pedido del 31 a las 23:59 en CDMX es del 31 aunque en UTC ya sea el día 1.
// Sin dependencias: Intl con la zona horaria; dos pasadas cubren un cambio de horario (hoy CDMX no tiene).

const TIME_ZONE = 'America/Mexico_City';
const formatter = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hourCycle: 'h23', year: 'numeric',
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const DATE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function localParts(ms) {
  return Object.fromEntries(formatter.formatToParts(new Date(ms)).map(part => [part.type, part.value]));
}
function offsetMs(ms) {
  const p = localParts(ms);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
/** Instante UTC de la medianoche local del día dado (mes 1–12; desborda con Date.UTC). */
function localMidnight(year, month, day = 1) {
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - offsetMs(guess);
  return new Date(guess - offsetMs(first));
}
/** "AAAA-MM-DD" local de un instante. */
function dateOf(date) {
  const p = localParts(date.getTime());
  return `${p.year}-${p.month}-${p.day}`;
}
/** "AAAA-MM" local de un instante. */
function monthOf(date) { return dateOf(date).slice(0, 7); }
function isDate(value) {
  const match = typeof value === 'string' && DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  return new Date(Date.UTC(+y, +m - 1, +d)).getUTCDate() === +d;
}
/** [inicio, fin) del día local "AAAA-MM-DD". */
function dayRange(value) {
  const [y, m, d] = value.split('-').map(Number);
  return { start: localMidnight(y, m, d), end: localMidnight(y, m, d + 1) };
}
/** [inicio, fin) del mes local "AAAA-MM". */
function monthRange(value) {
  const [y, m] = value.split('-').map(Number);
  return { start: localMidnight(y, m, 1), end: localMidnight(y, m + 1, 1) };
}
/** Día local anterior a "AAAA-MM-DD". */
function previousDate(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

module.exports = { TIME_ZONE, localMidnight, dateOf, monthOf, isDate, dayRange, monthRange, previousDate };
