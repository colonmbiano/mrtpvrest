'use strict';

// ───────────────────────────────────────────────────────────────────────────
// payroll.js — Cálculo de nómina PURO y testeable (sin Prisma, sin I/O).
//
// Esquema por defecto: pago POR DÍA TRABAJADO. Un "día trabajado" es un día
// natural (en hora local de México) en el que el empleado tiene al menos un
// EmployeeShift (clock-in). Así las faltas se descuentan solas: si no checó,
// ese día no suma.
//
// El bruto se calcula según el payType del perfil:
//   DAILY        → díasTrabajados × tarifaDiaria        (default)
//   HOURLY       → horasTrabajadas × tarifaHora
//   WEEKLY_FIXED → montoFijo del periodo (sin importar días)
//   PER_DELIVERY → entregas × comisiónPorEntrega
//
// El neto = bruto + propinas + comisión + adiciones − anticipos − deducciones.
// (propinas/comisión/anticipos llegan en 0 en la Fase 1; existen para Fases 2-3.)
//
// REGLA DE ORO (igual que money.js): el dinero se computa SIEMPRE en el
// servidor; nunca se confía en montos del cliente.
// ───────────────────────────────────────────────────────────────────────────

const { round2 } = require('./money');

const DEFAULT_TZ = 'America/Mexico_City';

/** Coacciona a Date; devuelve null si no es una fecha válida. */
function asDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Conjunto de claves 'YYYY-MM-DD' (en `timeZone`) de los días en que el empleado
 * tuvo al menos un turno. en-CA produce el formato ISO de fecha directamente.
 * @param {{startAt: Date|string}[]} shifts
 * @returns {Set<string>}
 */
function workedDayKeys(shifts, timeZone = DEFAULT_TZ) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const set = new Set();
  for (const s of shifts || []) {
    const d = asDate(s && s.startAt);
    if (d) set.add(fmt.format(d));
  }
  return set;
}

/** Número de días naturales distintos con al menos un turno. */
function countWorkedDays(shifts, timeZone = DEFAULT_TZ) {
  return workedDayKeys(shifts, timeZone).size;
}

/**
 * Horas trabajadas = suma de (endAt − startAt) de los turnos cerrados.
 * Los turnos abiertos (sin endAt) no cuentan hasta cerrarse.
 */
function sumWorkedHours(shifts) {
  let ms = 0;
  for (const s of shifts || []) {
    const a = asDate(s && s.startAt);
    const b = asDate(s && s.endAt);
    if (a && b && b.getTime() > a.getTime()) ms += b.getTime() - a.getTime();
  }
  return round2(ms / 3_600_000);
}

/**
 * Bruto del periodo según el esquema de pago.
 * @returns {number}
 */
function computeGross({
  payType = 'DAILY',
  daysWorked = 0,
  dailyRate = 0,
  hoursWorked = 0,
  hourlyRate = 0,
  fixedAmount = 0,
  deliveries = 0,
  perDeliveryRate = 0,
} = {}) {
  switch (payType) {
    case 'HOURLY':
      return round2(Number(hoursWorked) * Number(hourlyRate));
    case 'WEEKLY_FIXED':
      return round2(Number(fixedAmount));
    case 'PER_DELIVERY':
      return round2(Number(deliveries) * Number(perDeliveryRate));
    case 'DAILY':
    default:
      return round2(Number(daysWorked) * Number(dailyRate));
  }
}

/**
 * Neto = bruto + propinas + comisión + adiciones − anticipos − deducciones.
 * Puede ser negativo (el empleado queda debiendo): se reporta tal cual, no se
 * recorta a 0, para no esconder un saldo a favor del negocio.
 * @returns {number}
 */
function computeNet({
  gross = 0,
  tips = 0,
  commission = 0,
  additions = 0,
  advancesDeducted = 0,
  deductions = 0,
} = {}) {
  const net =
    Number(gross) +
    Number(tips) +
    Number(commission) +
    Number(additions) -
    Number(advancesDeducted) -
    Number(deductions);
  return round2(net);
}

/** Tarifa relevante según el payType del perfil (para snapshot en el renglón). */
function rateForPayType(profile = {}) {
  switch (profile.payType) {
    case 'HOURLY':       return Number(profile.hourlyRate || 0);
    case 'WEEKLY_FIXED': return Number(profile.fixedAmount || 0);
    case 'PER_DELIVERY': return Number(profile.perDeliveryRate || 0);
    case 'DAILY':
    default:             return Number(profile.dailyRate || 0);
  }
}

/**
 * Construye el cálculo completo de un renglón de la raya para un empleado.
 * Devuelve un objeto listo para persistir como PayrollItem (sin ids ni snapshots
 * de identidad, que los pone la ruta).
 *
 * @param {object} p
 * @param {object} p.profile              EmployeePayProfile (payType + tarifas).
 * @param {{startAt:Date|string,endAt?:Date|string}[]} p.shifts  Turnos del periodo.
 * @param {object} [p.extras]             Ajustes manuales/futuros (tips, commission,
 *                                        additions, advancesDeducted, deductions, deliveries).
 * @param {string} [p.timeZone]
 */
function buildItemComputation({ profile = {}, shifts = [], extras = {}, timeZone = DEFAULT_TZ } = {}) {
  const payType = profile.payType || 'DAILY';
  const daysWorked = countWorkedDays(shifts, timeZone);
  const hoursWorked = sumWorkedHours(shifts);

  const tips = Number(extras.tips || 0);
  const commission = Number(extras.commission || 0);
  const additions = Number(extras.additions || 0);
  const advancesDeducted = Number(extras.advancesDeducted || 0);
  const deductions = Number(extras.deductions || 0);
  const deliveries = Number(extras.deliveries || 0);

  const gross = computeGross({
    payType,
    daysWorked,
    dailyRate: profile.dailyRate,
    hoursWorked,
    hourlyRate: profile.hourlyRate,
    fixedAmount: profile.fixedAmount,
    deliveries,
    perDeliveryRate: profile.perDeliveryRate,
  });

  const net = computeNet({ gross, tips, commission, additions, advancesDeducted, deductions });

  return {
    payType,
    daysWorked,
    hoursWorked,
    rate: round2(rateForPayType(profile)),
    gross,
    tips: round2(tips),
    commission: round2(commission),
    additions: round2(additions),
    advancesDeducted: round2(advancesDeducted),
    deductions: round2(deductions),
    net,
  };
}

module.exports = {
  DEFAULT_TZ,
  workedDayKeys,
  countWorkedDays,
  sumWorkedHours,
  computeGross,
  computeNet,
  rateForPayType,
  buildItemComputation,
};
