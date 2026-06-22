'use strict';

const {
  workedDayKeys,
  countWorkedDays,
  sumWorkedHours,
  computeGross,
  computeNet,
  rateForPayType,
  buildItemComputation,
} = require('../src/lib/payroll');

// Helpers: construir un Date en hora local de México (UTC-6, sin DST en la
// mayoría del año) a partir de una hora UTC explícita.
const utc = (iso) => new Date(iso);

// ── días trabajados (por día natural en MX) ─────────────────────────────────
describe('payroll :: countWorkedDays', () => {
  test('cuenta días naturales distintos con al menos un turno', () => {
    const shifts = [
      { startAt: utc('2026-06-01T15:00:00Z') }, // 09:00 MX → 2026-06-01
      { startAt: utc('2026-06-01T23:00:00Z') }, // 17:00 MX → 2026-06-01 (mismo día)
      { startAt: utc('2026-06-02T16:00:00Z') }, // 10:00 MX → 2026-06-02
    ];
    expect(countWorkedDays(shifts)).toBe(2);
  });

  test('un turno que cruza medianoche UTC pero es el mismo día en MX cuenta 1', () => {
    // 2026-06-03 04:00Z = 2026-06-02 22:00 MX → cuenta como día 02, no 03.
    const shifts = [
      { startAt: utc('2026-06-02T20:00:00Z') }, // 14:00 MX → día 02
      { startAt: utc('2026-06-03T04:00:00Z') }, // 22:00 MX → día 02
    ];
    expect(countWorkedDays(shifts)).toBe(1);
    expect([...workedDayKeys(shifts)]).toEqual(['2026-06-02']);
  });

  test('lista vacía o fechas inválidas → 0 días', () => {
    expect(countWorkedDays([])).toBe(0);
    expect(countWorkedDays(null)).toBe(0);
    expect(countWorkedDays([{ startAt: 'no-es-fecha' }])).toBe(0);
  });
});

// ── horas trabajadas ─────────────────────────────────────────────────────────
describe('payroll :: sumWorkedHours', () => {
  test('suma (endAt − startAt) de turnos cerrados', () => {
    const shifts = [
      { startAt: utc('2026-06-01T15:00:00Z'), endAt: utc('2026-06-01T23:00:00Z') }, // 8h
      { startAt: utc('2026-06-02T16:00:00Z'), endAt: utc('2026-06-02T20:30:00Z') }, // 4.5h
    ];
    expect(sumWorkedHours(shifts)).toBe(12.5);
  });

  test('turnos abiertos (sin endAt) no cuentan', () => {
    const shifts = [
      { startAt: utc('2026-06-01T15:00:00Z') },
      { startAt: utc('2026-06-01T16:00:00Z'), endAt: utc('2026-06-01T18:00:00Z') }, // 2h
    ];
    expect(sumWorkedHours(shifts)).toBe(2);
  });
});

// ── bruto por esquema de pago ────────────────────────────────────────────────
describe('payroll :: computeGross', () => {
  test('DAILY = días × tarifa diaria (default)', () => {
    expect(computeGross({ payType: 'DAILY', daysWorked: 6, dailyRate: 350 })).toBe(2100);
    expect(computeGross({ daysWorked: 5, dailyRate: 300 })).toBe(1500); // default DAILY
  });

  test('HOURLY = horas × tarifa hora', () => {
    expect(computeGross({ payType: 'HOURLY', hoursWorked: 40, hourlyRate: 45.5 })).toBe(1820);
  });

  test('WEEKLY_FIXED = monto fijo, sin importar días', () => {
    expect(computeGross({ payType: 'WEEKLY_FIXED', fixedAmount: 2500, daysWorked: 3 })).toBe(2500);
  });

  test('PER_DELIVERY = entregas × comisión', () => {
    expect(computeGross({ payType: 'PER_DELIVERY', deliveries: 30, perDeliveryRate: 18 })).toBe(540);
  });
});

// ── neto ─────────────────────────────────────────────────────────────────────
describe('payroll :: computeNet', () => {
  test('neto = bruto + propinas + comisión + adiciones − anticipos − deducciones', () => {
    const net = computeNet({
      gross: 2100, tips: 300, commission: 120, additions: 50,
      advancesDeducted: 400, deductions: 70,
    });
    expect(net).toBe(2100 + 300 + 120 + 50 - 400 - 70);
  });

  test('puede ser negativo (el empleado queda debiendo) — no se recorta a 0', () => {
    expect(computeNet({ gross: 200, advancesDeducted: 500 })).toBe(-300);
  });

  test('redondeo contable a 2 decimales', () => {
    expect(computeNet({ gross: 0.1, additions: 0.2 })).toBe(0.3);
  });
});

// ── tarifa snapshot ──────────────────────────────────────────────────────────
describe('payroll :: rateForPayType', () => {
  test('elige la tarifa del esquema activo', () => {
    const profile = { dailyRate: 350, hourlyRate: 45, fixedAmount: 2500, perDeliveryRate: 18 };
    expect(rateForPayType({ ...profile, payType: 'DAILY' })).toBe(350);
    expect(rateForPayType({ ...profile, payType: 'HOURLY' })).toBe(45);
    expect(rateForPayType({ ...profile, payType: 'WEEKLY_FIXED' })).toBe(2500);
    expect(rateForPayType({ ...profile, payType: 'PER_DELIVERY' })).toBe(18);
    expect(rateForPayType(profile)).toBe(350); // sin payType → DAILY
  });
});

// ── cálculo completo del renglón ─────────────────────────────────────────────
describe('payroll :: buildItemComputation', () => {
  test('DAILY: 3 turnos en 2 días distintos × $350 = $700 bruto = neto sin extras', () => {
    const shifts = [
      { startAt: utc('2026-06-01T15:00:00Z') },
      { startAt: utc('2026-06-01T23:00:00Z') },
      { startAt: utc('2026-06-02T16:00:00Z') },
    ];
    const r = buildItemComputation({ profile: { payType: 'DAILY', dailyRate: 350 }, shifts });
    expect(r.daysWorked).toBe(2);
    expect(r.rate).toBe(350);
    expect(r.gross).toBe(700);
    expect(r.net).toBe(700);
  });

  test('extras (anticipos/deducciones) afectan el neto, no el bruto', () => {
    const shifts = [
      { startAt: utc('2026-06-01T15:00:00Z') },
      { startAt: utc('2026-06-02T15:00:00Z') },
    ];
    const r = buildItemComputation({
      profile: { payType: 'DAILY', dailyRate: 300 },
      shifts,
      extras: { advancesDeducted: 200, additions: 100 },
    });
    expect(r.gross).toBe(600);
    expect(r.net).toBe(600 + 100 - 200);
  });

  test('sin turnos → 0 días, 0 bruto (la falta total no cobra)', () => {
    const r = buildItemComputation({ profile: { payType: 'DAILY', dailyRate: 350 }, shifts: [] });
    expect(r.daysWorked).toBe(0);
    expect(r.gross).toBe(0);
    expect(r.net).toBe(0);
  });
});
