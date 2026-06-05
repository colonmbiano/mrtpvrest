'use strict';

// Tests de la lógica PURA de marketing: selección de premios por peso y
// segmentación de contactos. Sin BD ni red.

jest.mock('@mrtpvrest/database', () => ({ prisma: {} }));

const { pickPrize, isWinningPrize } = require('../src/services/promo-games.service');
const { buildSegmentWhere } = require('../src/services/remarketing.service');

describe('promo-games :: pickPrize', () => {
  const prizes = [
    { label: 'Sigue participando', type: 'NONE', value: 0, weight: 70 },
    { label: '10% de descuento', type: 'PERCENTAGE', value: 10, weight: 25 },
    { label: 'Refresco gratis', type: 'FIXED', value: 30, weight: 5 },
  ];

  test('rng al inicio del rango cae en el primer premio', () => {
    expect(pickPrize(prizes, () => 0).label).toBe('Sigue participando');
  });

  test('rng alto cae en el último premio', () => {
    // 0.99 * 100 = 99 → tras restar 70 y 25 quedan 4 < 5 → tercer premio.
    expect(pickPrize(prizes, () => 0.99).label).toBe('Refresco gratis');
  });

  test('sin premios devuelve null', () => {
    expect(pickPrize([], () => 0.5)).toBeNull();
    expect(pickPrize(null, () => 0.5)).toBeNull();
  });

  test('pesos en cero → equiprobable, no rompe', () => {
    const flat = [{ label: 'A', type: 'NONE', value: 0, weight: 0 }, { label: 'B', type: 'NONE', value: 0, weight: 0 }];
    expect(['A', 'B']).toContain(pickPrize(flat, () => 0.4).label);
  });

  test('isWinningPrize distingue premio real de "sigue participando"', () => {
    expect(isWinningPrize({ type: 'PERCENTAGE', value: 10 })).toBe(true);
    expect(isWinningPrize({ type: 'FIXED', value: 30 })).toBe(true);
    expect(isWinningPrize({ type: 'NONE', value: 0 })).toBe(false);
    expect(isWinningPrize({ type: 'PERCENTAGE', value: 0 })).toBe(false);
    expect(isWinningPrize(null)).toBe(false);
  });
});

describe('remarketing :: buildSegmentWhere', () => {
  const NOW = new Date('2026-06-05T12:00:00Z');
  const rid = 'r1';

  test('ALL solo filtra optIn', () => {
    expect(buildSegmentWhere(rid, 'ALL', NOW)).toEqual({ restaurantId: rid, optIn: true });
  });

  test('RECENT exige pedido en los últimos 7 días', () => {
    const w = buildSegmentWhere(rid, 'RECENT', NOW);
    expect(w.lastOrderAt.gte).toEqual(new Date(NOW.getTime() - 7 * 86400000));
  });

  test('INACTIVE incluye nulos o > 30 días', () => {
    const w = buildSegmentWhere(rid, 'INACTIVE', NOW);
    expect(w.OR).toEqual([
      { lastOrderAt: null },
      { lastOrderAt: { lt: new Date(NOW.getTime() - 30 * 86400000) } },
    ]);
  });

  test('FREQUENT exige 3+ pedidos', () => {
    expect(buildSegmentWhere(rid, 'FREQUENT', NOW).orderCount).toEqual({ gte: 3 });
  });

  test('segmento desconocido cae en ALL', () => {
    expect(buildSegmentWhere(rid, 'XYZ', NOW)).toEqual({ restaurantId: rid, optIn: true });
  });
});
