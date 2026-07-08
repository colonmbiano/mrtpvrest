'use strict';

const { computeBulkPromoDiscount, withinDailyWindow, localTimeHHmm } = require('../src/lib/bulk-promo');
const { computeOrderTotals } = require('../src/lib/money');

// Categorías de prueba
const ALITAS = 'cat_alitas';
const BONELESS = 'cat_boneless';
const REFRESCOS = 'cat_refrescos';

// Promo 3x2 con pool combinado alitas + boneless (caso del usuario).
const promo3x2 = {
  id: 'promo_1',
  name: '3x2 Alitas y Boneless',
  buyQuantity: 3,
  payQuantity: 2,
  categoryIds: [ALITAS, BONELESS],
};

describe('computeBulkPromoDiscount :: 3x2 pool combinado', () => {
  test('sin promos o sin items → 0', () => {
    expect(computeBulkPromoDiscount([], [promo3x2]).promoDiscount).toBe(0);
    expect(computeBulkPromoDiscount([{ price: 100, quantity: 3, categoryId: ALITAS }], []).promoDiscount).toBe(0);
  });

  test('menos de N unidades → sin descuento', () => {
    const items = [{ price: 100, quantity: 2, categoryId: ALITAS }];
    expect(computeBulkPromoDiscount(items, [promo3x2]).promoDiscount).toBe(0);
  });

  test('3 alitas iguales → 1 gratis (la más barata = igual)', () => {
    const items = [{ price: 90, quantity: 3, categoryId: ALITAS }];
    const { promoDiscount, applied } = computeBulkPromoDiscount(items, [promo3x2]);
    expect(promoDiscount).toBe(90);
    expect(applied[0].freeUnits).toBe(1);
  });

  test('pool combinado: 2 alitas + 1 boneless = 1 bloque → regala la MÁS BARATA', () => {
    const items = [
      { price: 120, quantity: 2, categoryId: ALITAS },   // 120, 120
      { price: 80, quantity: 1, categoryId: BONELESS },  // 80  ← la más barata
    ];
    const { promoDiscount } = computeBulkPromoDiscount(items, [promo3x2]);
    expect(promoDiscount).toBe(80);
  });

  test('6 unidades → 2 gratis (las 2 más baratas)', () => {
    const items = [
      { price: 100, quantity: 3, categoryId: ALITAS },   // 100,100,100
      { price: 60, quantity: 3, categoryId: BONELESS },  // 60,60,60
    ];
    // 6 unidades / 3 = 2 bloques → 2 gratis → las 2 más baratas (60+60)
    const { promoDiscount } = computeBulkPromoDiscount(items, [promo3x2]);
    expect(promoDiscount).toBe(120);
  });

  test('7 unidades → solo 2 gratis (bloque incompleto no cuenta)', () => {
    const items = [{ price: 50, quantity: 7, categoryId: ALITAS }];
    // floor(7/3)=2 bloques → 2 gratis
    const { promoDiscount } = computeBulkPromoDiscount(items, [promo3x2]);
    expect(promoDiscount).toBe(100);
  });

  test('productos fuera del pool no cuentan', () => {
    const items = [
      { price: 100, quantity: 2, categoryId: ALITAS },
      { price: 100, quantity: 5, categoryId: REFRESCOS }, // no elegible
    ];
    // solo 2 alitas elegibles → sin bloque completo
    expect(computeBulkPromoDiscount(items, [promo3x2]).promoDiscount).toBe(0);
  });

  test('precio o cantidad inválidos se ignoran sin romper', () => {
    const items = [
      { price: 0, quantity: 3, categoryId: ALITAS },
      { price: 100, quantity: 0, categoryId: ALITAS },
      { price: 100, quantity: 3, categoryId: ALITAS },
    ];
    expect(computeBulkPromoDiscount(items, [promo3x2]).promoDiscount).toBe(100);
  });
});

describe('computeBulkPromoDiscount :: anti doble-conteo', () => {
  test('una unidad la consume solo la PRIMERA promo que cubra su categoría', () => {
    const promoA = { id: 'a', name: 'A', buyQuantity: 3, payQuantity: 2, categoryIds: [ALITAS] };
    const promoB = { id: 'b', name: 'B', buyQuantity: 2, payQuantity: 1, categoryIds: [ALITAS] };
    const items = [{ price: 100, quantity: 3, categoryId: ALITAS }];
    // Solo promoA (primera) recibe las 3 alitas → 1 gratis = 100. promoB no ve nada.
    const { promoDiscount, applied } = computeBulkPromoDiscount(items, [promoA, promoB]);
    expect(promoDiscount).toBe(100);
    expect(applied).toHaveLength(1);
    expect(applied[0].promoId).toBe('a');
  });

  test('2x1 (buy=2,pay=1) en otra categoría', () => {
    const promo2x1 = { id: 'c', name: '2x1', buyQuantity: 2, payQuantity: 1, categoryIds: [REFRESCOS] };
    const items = [{ price: 30, quantity: 4, categoryId: REFRESCOS }];
    // 4/2 = 2 bloques → 2 gratis (las 2 más baratas = 30+30)
    expect(computeBulkPromoDiscount(items, [promo2x1]).promoDiscount).toBe(60);
  });

  test('promo inválida (pay >= buy) se ignora', () => {
    const bad = { id: 'x', name: 'bad', buyQuantity: 2, payQuantity: 2, categoryIds: [ALITAS] };
    const items = [{ price: 100, quantity: 4, categoryId: ALITAS }];
    expect(computeBulkPromoDiscount(items, [bad]).promoDiscount).toBe(0);
  });
});

describe('withinDailyWindow :: ventana horaria diaria', () => {
  test('sin ventana → siempre aplica', () => {
    expect(withinDailyWindow('23:59', null, null)).toBe(true);
    expect(withinDailyWindow('00:00', null, null)).toBe(true);
  });

  test('solo endTime ("hasta las 9 pm"): aplica antes, NO después', () => {
    expect(withinDailyWindow('12:00', null, '21:00')).toBe(true);
    expect(withinDailyWindow('21:00', null, '21:00')).toBe(true); // inclusive
    expect(withinDailyWindow('21:01', null, '21:00')).toBe(false);
    expect(withinDailyWindow('23:30', null, '21:00')).toBe(false);
    expect(withinDailyWindow('00:10', null, '21:00')).toBe(true); // madrugada = antes del corte
  });

  test('solo startTime: aplica desde esa hora hasta medianoche', () => {
    expect(withinDailyWindow('15:59', '16:00', null)).toBe(false);
    expect(withinDailyWindow('16:00', '16:00', null)).toBe(true);
    expect(withinDailyWindow('23:59', '16:00', null)).toBe(true);
  });

  test('ventana normal 16:00–21:00', () => {
    expect(withinDailyWindow('15:59', '16:00', '21:00')).toBe(false);
    expect(withinDailyWindow('18:00', '16:00', '21:00')).toBe(true);
    expect(withinDailyWindow('21:01', '16:00', '21:00')).toBe(false);
  });

  test('ventana que cruza medianoche 22:00–02:00', () => {
    expect(withinDailyWindow('23:00', '22:00', '02:00')).toBe(true);
    expect(withinDailyWindow('01:30', '22:00', '02:00')).toBe(true);
    expect(withinDailyWindow('12:00', '22:00', '02:00')).toBe(false);
  });
});

describe('localTimeHHmm :: hora local de la tienda', () => {
  test('convierte UTC a hora de México (formato HH:mm h23)', () => {
    // 2026-07-08 03:30 UTC = 21:30 del 7 de julio en CDMX (UTC-6, sin DST).
    expect(localTimeHHmm(new Date('2026-07-08T03:30:00Z'), 'America/Mexico_City')).toBe('21:30');
    // Medianoche local no debe salir como "24:xx".
    expect(localTimeHHmm(new Date('2026-07-08T06:05:00Z'), 'America/Mexico_City')).toBe('00:05');
  });
});

describe('integración con computeOrderTotals', () => {
  test('promoDiscount se acota y resta antes del descuento manual', () => {
    const lines = [{ subtotal: 300 }];
    const r = computeOrderTotals(lines, { discount: 50, promoDiscount: 100 });
    expect(r.subtotal).toBe(300);
    expect(r.promoDiscount).toBe(100);
    expect(r.discount).toBe(50);
    expect(r.total).toBe(150); // 300 - 100 - 50
  });

  test('promo + descuento nunca pasan del subtotal', () => {
    const lines = [{ subtotal: 100 }];
    // promo 80, descuento manual pedido 50 → descuento se acota a 20 (remanente)
    const r = computeOrderTotals(lines, { discount: 50, promoDiscount: 80 });
    expect(r.promoDiscount).toBe(80);
    expect(r.discount).toBe(20);
    expect(r.total).toBe(0);
  });

  test('sin promoDiscount mantiene comportamiento previo', () => {
    const lines = [{ subtotal: 200 }];
    const r = computeOrderTotals(lines, { discount: 30 });
    expect(r.promoDiscount).toBe(0);
    expect(r.total).toBe(170);
  });
});
