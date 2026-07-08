'use strict';

const { promoWindowOpen } = require('../src/lib/promo-window');

// 2026-07-08T0X:XXZ — CDMX es UTC-6 (sin DST desde 2022).
const utc = (hhmm) => new Date(`2026-07-08T${hhmm}:00Z`);
const MX = 'America/Mexico_City';

describe('promoWindowOpen :: ventana horaria de precios promo', () => {
  test('sin ventana configurada → siempre abierta (comportamiento histórico)', () => {
    expect(promoWindowOpen(null)).toBe(true);
    expect(promoWindowOpen({})).toBe(true);
    expect(promoWindowOpen({ promoStartTime: null, promoEndTime: null, timezone: MX })).toBe(true);
  });

  test('solo promoEndTime 21:00: abierta a las 8:30 pm, cerrada a las 9:30 pm (hora MX)', () => {
    const cfg = { promoEndTime: '21:00', timezone: MX };
    expect(promoWindowOpen(cfg, utc('02:30'))).toBe(true); // 20:30 MX
    expect(promoWindowOpen(cfg, utc('03:00'))).toBe(true); // 21:00 MX (inclusive)
    expect(promoWindowOpen(cfg, utc('03:30'))).toBe(false); // 21:30 MX
    expect(promoWindowOpen(cfg, utc('05:59'))).toBe(false); // 23:59 MX
    expect(promoWindowOpen(cfg, utc('06:10'))).toBe(true); // 00:10 MX (nuevo día)
  });

  test('ventana completa 12:00–21:00', () => {
    const cfg = { promoStartTime: '12:00', promoEndTime: '21:00', timezone: MX };
    expect(promoWindowOpen(cfg, utc('17:30'))).toBe(false); // 11:30 MX
    expect(promoWindowOpen(cfg, utc('18:00'))).toBe(true); // 12:00 MX
    expect(promoWindowOpen(cfg, utc('03:30'))).toBe(false); // 21:30 MX
  });

  test('sin timezone en config cae a America/Mexico_City', () => {
    expect(promoWindowOpen({ promoEndTime: '21:00' }, utc('03:30'))).toBe(false); // 21:30 MX
  });
});
