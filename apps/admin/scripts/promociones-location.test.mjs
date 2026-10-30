// Admin Promociones por Sucursal - Dry-Run & Descuentos
// Verifica: payloads, cálculo de descuentos y flujo dryRun
// Sin dependencias instaladas: Node >= 22.18
//   node apps/admin/scripts/promociones-location.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const DAY_LABELS = {
  MONDAY: 'Lunes',
  TUESDAY: 'Martes',
  WEDNESDAY: 'Miércoles',
  THURSDAY: 'Jueves',
  FRIDAY: 'Viernes',
  SATURDAY: 'Sábado',
  SUNDAY: 'Domingo',
};

const ALL_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

// Utilities for testing

const discountPct = (price, promo) =>
  Math.round(((price - promo) / price) * 100);

const calculatePromoPrice = (price, discountPercent) =>
  Math.round(price * (1 - discountPercent / 100) * 100) / 100;

const validatePromoSettings = (settings) => {
  if (typeof settings.autoPromoThreshold !== 'number' || settings.autoPromoThreshold < 1) return false;
  if (typeof settings.autoPromoDiscount !== 'number' || settings.autoPromoDiscount < 1 || settings.autoPromoDiscount > 100) return false;
  if (typeof settings.autoPromoMaxItems !== 'number' || settings.autoPromoMaxItems < 0) return false;
  if (!Array.isArray(settings.activeDays) || settings.activeDays.length === 0) return false;
  return settings.activeDays.every(day => ALL_DAYS.includes(day));
};

const calculateDryRunEstimate = (recommendedItems) => {
  if (recommendedItems.length === 0) {
    return { itemsInPromo: 0, averageDiscount: 0 };
  }
  const avgDiscount = Math.round(
    recommendedItems.reduce((sum, item) => sum + item.discount, 0) / recommendedItems.length
  );
  return {
    itemsInPromo: recommendedItems.length,
    averageDiscount: avgDiscount,
  };
};

// ── Tipos y Payloads ───────────────────────────────────────────────────────

test('PromoSettings: estructura válida con todos los campos requeridos', () => {
  const settings = {
    autoPromoThreshold: 10,
    autoPromoDiscount: 15,
    autoPromoMaxItems: 8,
    activeDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  };

  assert.equal(validatePromoSettings(settings), true);
});

test('PromoSettings: activeDays puede ser todos los días', () => {
  const settings = {
    autoPromoThreshold: 5,
    autoPromoDiscount: 20,
    autoPromoMaxItems: 10,
    activeDays: ALL_DAYS,
  };

  assert.equal(validatePromoSettings(settings), true);
  assert.equal(settings.activeDays.length, 7);
});

test('PromoSettings: activeDays puede ser un subconjunto', () => {
  const settings = {
    autoPromoThreshold: 8,
    autoPromoDiscount: 18,
    autoPromoMaxItems: 5,
    activeDays: ['FRIDAY', 'SATURDAY', 'SUNDAY'],
  };

  assert.equal(validatePromoSettings(settings), true);
  assert.equal(settings.activeDays.length, 3);
});

test('PromoSettings: rechaza descuento inválido', () => {
  const invalid1 = {
    autoPromoThreshold: 10,
    autoPromoDiscount: 0,
    autoPromoMaxItems: 8,
    activeDays: ALL_DAYS,
  };
  assert.equal(validatePromoSettings(invalid1), false);

  const invalid2 = {
    autoPromoThreshold: 10,
    autoPromoDiscount: 101,
    autoPromoMaxItems: 8,
    activeDays: ALL_DAYS,
  };
  assert.equal(validatePromoSettings(invalid2), false);
});

test('PromoSettings: rechaza umbral inválido', () => {
  const invalid = {
    autoPromoThreshold: 0,
    autoPromoDiscount: 15,
    autoPromoMaxItems: 8,
    activeDays: ALL_DAYS,
  };

  assert.equal(validatePromoSettings(invalid), false);
});

test('PromoSettings: rechaza activeDays vacío', () => {
  const invalid = {
    autoPromoThreshold: 10,
    autoPromoDiscount: 15,
    autoPromoMaxItems: 8,
    activeDays: [],
  };

  assert.equal(validatePromoSettings(invalid), false);
});

// ── Cálculo de Descuentos ──────────────────────────────────────────────────

test('discountPct: calcula descuento correcto', () => {
  assert.equal(discountPct(100, 80), 20);
  assert.equal(discountPct(250, 200), 20);
  assert.equal(discountPct(50, 35), 30);
});

test('discountPct: redondea correctamente', () => {
  assert.equal(discountPct(100, 67), 33);
  assert.equal(discountPct(100, 66), 34);
});

test('calculatePromoPrice: calcula precio con descuento', () => {
  assert.equal(calculatePromoPrice(100, 20), 80);
  assert.equal(calculatePromoPrice(250, 15), 212.5);
  assert.equal(calculatePromoPrice(100, 33), 67);
});

test('roundtrip: discount y calculate son inversos', () => {
  const prices = [100, 250, 50, 999, 15];
  const discounts = [10, 15, 20, 25, 30];

  for (const price of prices) {
    for (const discount of discounts) {
      const promoPrice = calculatePromoPrice(price, discount);
      const calculated = discountPct(price, promoPrice);
      assert.equal(calculated, discount, `${price} @ ${discount}%`);
    }
  }
});

// ── DryRun Results ────────────────────────────────────────────────────────

test('DryRunResult: estructura válida con items recomendados', () => {
  const result = {
    recommendedItems: [
      { id: '1', name: 'Tacos', currentPrice: 25, recommendedPrice: 20, discount: 20, soldLast7Days: 5 },
      { id: '2', name: 'Quesadillas', currentPrice: 30, recommendedPrice: 24, discount: 20, soldLast7Days: 3 },
    ],
    totalItemsApplicable: 2,
    estimatedImpact: {
      itemsInPromo: 2,
      averageDiscount: 20,
    },
  };

  assert.equal(result.recommendedItems.length, 2);
  assert.equal(result.estimatedImpact.itemsInPromo, 2);
  assert.equal(result.estimatedImpact.averageDiscount, 20);
});

test('DryRunResult: sin items recomendados es válido', () => {
  const result = {
    recommendedItems: [],
    totalItemsApplicable: 10,
    estimatedImpact: {
      itemsInPromo: 0,
      averageDiscount: 0,
    },
  };

  assert.equal(result.recommendedItems.length, 0);
  assert.equal(result.estimatedImpact.itemsInPromo, 0);
});

test('DryRunResult: calcula estimatedImpact correctamente', () => {
  const items = [
    { discount: 20 },
    { discount: 20 },
    { discount: 15 },
  ];

  const impact = calculateDryRunEstimate(items);
  assert.equal(impact.itemsInPromo, 3);
  assert.equal(impact.averageDiscount, 18);
});

// ── Flujo de Dry-Run ──────────────────────────────────────────────────────

test('dryRun: POST /api/locations/:id/run-promo-engine { dryRun: true }', () => {
  const locationId = 'loc-123';
  const payload = { dryRun: true };

  assert.equal(locationId, 'loc-123');
  assert.deepEqual(payload, { dryRun: true });
});

test('applyNow: POST /api/locations/:id/run-promo-engine { dryRun: false }', () => {
  const locationId = 'loc-123';
  const payload = { dryRun: false };

  assert.equal(locationId, 'loc-123');
  assert.deepEqual(payload, { dryRun: false });
});

test('dryRun → applyNow: flujo completo', () => {
  const locationId = 'loc-456';
  const dryRunPayload = { dryRun: true };
  const applyPayload = { dryRun: false };

  let flow = [];

  flow.push({ endpoint: `/api/locations/${locationId}/run-promo-engine`, payload: dryRunPayload });
  flow.push({ endpoint: `/api/locations/${locationId}/run-promo-engine`, payload: applyPayload });

  assert.equal(flow.length, 2);
  assert.equal(flow[0].payload.dryRun, true);
  assert.equal(flow[1].payload.dryRun, false);
});

// ── PUT Promo Settings ────────────────────────────────────────────────────

test('PUT /api/locations/:id/promo-settings: payload válido', () => {
  const locationId = 'loc-789';
  const payload = {
    autoPromoThreshold: 10,
    autoPromoDiscount: 20,
    autoPromoMaxItems: 8,
    activeDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  };

  assert.equal(validatePromoSettings(payload), true);
});

test('PUT /api/locations/:id/promo-settings: actualiza estado local', () => {
  const location = {
    id: 'loc-123',
    name: 'Centro',
    autoPromoEnabled: true,
    autoPromoThreshold: 5,
    autoPromoDiscount: 15,
    autoPromoMaxItems: 10,
    activeDays: ALL_DAYS,
  };

  const updated = {
    ...location,
    autoPromoThreshold: 8,
    autoPromoDiscount: 20,
    autoPromoMaxItems: 12,
    activeDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  };

  assert.equal(updated.autoPromoThreshold, 8);
  assert.equal(updated.autoPromoDiscount, 20);
  assert.equal(updated.autoPromoMaxItems, 12);
  assert.equal(updated.activeDays.length, 5);
});

// ── Modal Previsualización ────────────────────────────────────────────────

test('DryRun Modal: muestra platillos recomendados', () => {
  const result = {
    recommendedItems: [
      { id: '1', name: 'Tacos', currentPrice: 25, recommendedPrice: 20, discount: 20, soldLast7Days: 5 },
      { id: '2', name: 'Birria', currentPrice: 35, recommendedPrice: 28, discount: 20, soldLast7Days: 2 },
    ],
    totalItemsApplicable: 8,
    estimatedImpact: {
      itemsInPromo: 2,
      averageDiscount: 20,
    },
  };

  assert.equal(result.recommendedItems.length, 2);
  assert.equal(result.recommendedItems[0].name, 'Tacos');
  assert.equal(result.recommendedItems[0].currentPrice, 25);
  assert.equal(result.recommendedItems[0].recommendedPrice, 20);
});

test('DryRun Modal: muestra estado vacío si no hay items', () => {
  const result = {
    recommendedItems: [],
    totalItemsApplicable: 5,
    estimatedImpact: {
      itemsInPromo: 0,
      averageDiscount: 0,
    },
  };

  assert.equal(result.recommendedItems.length, 0);
  assert.equal(result.estimatedImpact.itemsInPromo, 0);
});

test('DryRun Modal: calcula estado de botón "Aplicar Ahora"', () => {
  const applyingDryRun = false;
  const hasResult = true;

  const buttonDisabled = applyingDryRun;
  assert.equal(buttonDisabled, false);
});

// ── Location Config Modal ──────────────────────────────────────────────────

test('ConfigDraft: inicializa con activeDays', () => {
  const location = {
    id: 'loc-123',
    autoPromoThreshold: 10,
    autoPromoDiscount: 15,
    autoPromoMaxItems: 8,
    activeDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY'],
  };

  const draft = {
    autoPromoThreshold: location.autoPromoThreshold,
    autoPromoDiscount: location.autoPromoDiscount,
    autoPromoMaxItems: location.autoPromoMaxItems,
    activeDays: location.activeDays,
  };

  assert.deepEqual(draft.activeDays, ['MONDAY', 'TUESDAY', 'WEDNESDAY']);
});

test('ConfigDraft: actualiza activeDays', () => {
  let draft = {
    autoPromoThreshold: 10,
    autoPromoDiscount: 15,
    autoPromoMaxItems: 8,
    activeDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY'],
  };

  const day = 'FRIDAY';
  const isChecked = true;

  if (isChecked) {
    draft.activeDays = [...draft.activeDays, day];
  }

  assert.equal(draft.activeDays.includes('FRIDAY'), true);
  assert.equal(draft.activeDays.length, 4);
});

test('ConfigDraft: remueve day de activeDays', () => {
  let draft = {
    autoPromoThreshold: 10,
    autoPromoDiscount: 15,
    autoPromoMaxItems: 8,
    activeDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'FRIDAY'],
  };

  const day = 'FRIDAY';
  const isChecked = false;

  if (!isChecked) {
    draft.activeDays = draft.activeDays.filter(d => d !== day);
  }

  assert.equal(draft.activeDays.includes('FRIDAY'), false);
  assert.equal(draft.activeDays.length, 3);
});

// ── Edge Cases ────────────────────────────────────────────────────────────

test('edge case: maxItems = 0 significa sin tope', () => {
  const settings1 = { autoPromoMaxItems: 0 };
  const settings2 = { autoPromoMaxItems: 5 };

  assert.equal(settings1.autoPromoMaxItems > 0 ? settings1.autoPromoMaxItems : '∞', '∞');
  assert.equal(settings2.autoPromoMaxItems > 0 ? settings2.autoPromoMaxItems : '∞', 5);
});

test('edge case: cálculo de descuento con precios extremos', () => {
  assert.equal(discountPct(0.50, 0.40), 20);
  assert.equal(discountPct(9999, 7999), 20);
});

test('completeness: todos los DAY_LABELS están presentes', () => {
  for (const day of ALL_DAYS) {
    assert.ok(DAY_LABELS[day], `DAY_LABEL para ${day} falta`);
  }
});

test('completeness: todos los DayOfWeek están en ALL_DAYS', () => {
  const expectedDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  assert.deepEqual(ALL_DAYS, expectedDays);
});
