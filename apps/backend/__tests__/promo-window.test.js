'use strict';

const {
  promoWindowOpen,
  itemPromoWindowOpen,
  effectivePromoWindow,
  normalizePromoWindowTime,
} = require('../src/lib/promo-window');

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

describe('itemPromoWindowOpen :: ventana horaria POR PRODUCTO (override)', () => {
  const globalCfg = { promoEndTime: '21:00', timezone: MX }; // corte global 21:00

  test('item sin ventana propia → hereda el corte global (cerrado a las 21:50)', () => {
    const item = { promoStartTime: null, promoEndTime: null };
    expect(itemPromoWindowOpen(item, globalCfg, utc('02:30'))).toBe(true);  // 20:30 MX
    expect(itemPromoWindowOpen(item, globalCfg, utc('03:50'))).toBe(false); // 21:50 MX
  });

  test('combo de fin de semana con "Desde 00:00" corre toda la noche pese al corte global', () => {
    // Este es el caso del usuario: el corte global cierra a las 21:00, pero el
    // combo define su propia ventana (desde medianoche, sin fin) → 24h.
    const combo = { promoStartTime: '00:00', promoEndTime: null };
    expect(itemPromoWindowOpen(combo, globalCfg, utc('03:50'))).toBe(true);  // 21:50 MX
    expect(itemPromoWindowOpen(combo, globalCfg, utc('05:59'))).toBe(true);  // 23:59 MX
  });

  test('item con ventana propia 12:00–23:00 ignora por completo el corte global', () => {
    const item = { promoStartTime: '12:00', promoEndTime: '23:00' };
    expect(itemPromoWindowOpen(item, globalCfg, utc('17:30'))).toBe(false); // 11:30 MX
    expect(itemPromoWindowOpen(item, globalCfg, utc('18:00'))).toBe(true);  // 12:00 MX
    expect(itemPromoWindowOpen(item, globalCfg, utc('03:50'))).toBe(true);  // 21:50 MX (pasó el corte global)
  });

  test('sin override ni corte global → siempre abierto', () => {
    expect(itemPromoWindowOpen({}, null, utc('03:50'))).toBe(true);
    expect(itemPromoWindowOpen(null, {}, utc('03:50'))).toBe(true);
  });

  test('effectivePromoWindow: el override del item gana; si no, cae a la global', () => {
    expect(effectivePromoWindow({ promoStartTime: '10:00', promoEndTime: null }, globalCfg))
      .toEqual({ start: '10:00', end: null });
    expect(effectivePromoWindow({ promoStartTime: null, promoEndTime: null }, globalCfg))
      .toEqual({ start: null, end: '21:00' });
  });
});

describe('normalizePromoWindowTime', () => {
  test('acepta HH:mm válido, rechaza el resto → null', () => {
    expect(normalizePromoWindowTime('09:30')).toBe('09:30');
    expect(normalizePromoWindowTime('23:59')).toBe('23:59');
    expect(normalizePromoWindowTime('00:00')).toBe('00:00');
    expect(normalizePromoWindowTime('')).toBeNull();
    expect(normalizePromoWindowTime(null)).toBeNull();
    expect(normalizePromoWindowTime(undefined)).toBeNull();
    expect(normalizePromoWindowTime('24:00')).toBeNull();
    expect(normalizePromoWindowTime('9:30')).toBeNull();
    expect(normalizePromoWindowTime('abc')).toBeNull();
  });
});
