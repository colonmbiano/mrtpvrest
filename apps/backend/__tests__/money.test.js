'use strict';

const {
  resolveVariantSelection,
  applyFreeModifiers,
  lineSubtotal,
  computeOrderTotals,
  summarizePayments,
  cashCutSummary,
  PAYMENT_METHOD_MAP,
} = require('../src/lib/money');

// ── resolveVariantSelection ─────────────────────────────────────────────────
describe('money :: resolveVariantSelection', () => {
  const menuItem = {
    name: 'Pizza',
    price: 100,
    variants: [
      { id: 'v_grande', name: 'Grande', price: 150 },   // >= base → reemplaza
      { id: 'v_chica', name: 'Chica', price: 80 },       // < base (>0) → extra
      { id: 'v_extraq', name: 'Extra queso', price: 20 },// < base (>0) → extra
      { id: 'v_gratis', name: 'Sin cebolla', price: 0 }, // 0 → no suma
      { id: 'v_off', name: 'Agotada', price: 50, isAvailable: false },
    ],
  };

  test('sin variantes usa el precio base y el nombre base', () => {
    const r = resolveVariantSelection(menuItem, {});
    expect(r.basePrice).toBe(100);
    expect(r.name).toBe('Pizza');
    expect(r.variants).toEqual([]);
  });

  test('promoPrice tiene prioridad sobre price como base', () => {
    const r = resolveVariantSelection({ ...menuItem, promoPrice: 90 }, {});
    expect(r.basePrice).toBe(90);
  });

  test('variante >= base reemplaza el precio (toma el mayor)', () => {
    const r = resolveVariantSelection(menuItem, { variantId: 'v_grande' });
    expect(r.basePrice).toBe(150);
    expect(r.name).toBe('Pizza (Grande)');
  });

  test('variantes < base se suman como extra sobre el precio base', () => {
    const r = resolveVariantSelection(menuItem, { variantIds: ['v_chica', 'v_extraq'] });
    // base 100 + 80 + 20 = 200
    expect(r.basePrice).toBe(200);
  });

  test('combina reemplazo + extras correctamente', () => {
    const r = resolveVariantSelection(menuItem, { variantIds: ['v_grande', 'v_extraq'] });
    // max(100,150) + 20 = 170
    expect(r.basePrice).toBe(170);
  });

  test('variante de precio 0 no altera el total', () => {
    const r = resolveVariantSelection(menuItem, { variantIds: ['v_gratis'] });
    expect(r.basePrice).toBe(100);
  });

  test('variante no disponible lanza error (no se cobra ni se omite en silencio)', () => {
    expect(() => resolveVariantSelection(menuItem, { variantId: 'v_off' })).toThrow(
      /no disponible/
    );
  });

  test('variante inexistente lanza error', () => {
    expect(() => resolveVariantSelection(menuItem, { variantId: 'nope' })).toThrow();
  });
});

// ── applyFreeModifiers ──────────────────────────────────────────────────────
describe('money :: applyFreeModifiers (N gratis por grupo)', () => {
  test('los más baratos van gratis primero', () => {
    const groupsById = new Map([['g1', { id: 'g1', freeModifiersLimit: 2 }]]);
    const selectedByGroup = new Map([
      ['g1', [
        { id: 'm_caro', name: 'Tocino', groupId: 'g1', priceAdd: 30 },
        { id: 'm_medio', name: 'Queso', groupId: 'g1', priceAdd: 20 },
        { id: 'm_barato', name: 'Cebolla', groupId: 'g1', priceAdd: 10 },
      ]],
    ]);
    const { unitExtra, flatMods } = applyFreeModifiers(selectedByGroup, groupsById);
    // gratis: cebolla(10) y queso(20); se cobra tocino(30)
    expect(unitExtra).toBe(30);
    const byName = Object.fromEntries(flatMods.map((m) => [m.name, m.priceAdd]));
    expect(byName).toEqual({ Cebolla: 0, Queso: 0, Tocino: 30 });
  });

  test('sin límite gratis cobra todos', () => {
    const groupsById = new Map([['g1', { id: 'g1', freeModifiersLimit: 0 }]]);
    const selectedByGroup = new Map([
      ['g1', [
        { id: 'a', name: 'A', groupId: 'g1', priceAdd: 5 },
        { id: 'b', name: 'B', groupId: 'g1', priceAdd: 7 },
      ]],
    ]);
    const { unitExtra } = applyFreeModifiers(selectedByGroup, groupsById);
    expect(unitExtra).toBe(12);
  });

  test('el límite gratis es independiente por grupo', () => {
    const groupsById = new Map([
      ['g1', { id: 'g1', freeModifiersLimit: 1 }],
      ['g2', { id: 'g2', freeModifiersLimit: 0 }],
    ]);
    const selectedByGroup = new Map([
      ['g1', [
        { id: 'a', name: 'A', groupId: 'g1', priceAdd: 10 },
        { id: 'b', name: 'B', groupId: 'g1', priceAdd: 15 },
      ]],
      ['g2', [{ id: 'c', name: 'C', groupId: 'g2', priceAdd: 8 }]],
    ]);
    const { unitExtra } = applyFreeModifiers(selectedByGroup, groupsById);
    // g1: gratis A(10), cobra B(15) ; g2: cobra C(8) → 23
    expect(unitExtra).toBe(23);
  });
});

// ── lineSubtotal ────────────────────────────────────────────────────────────
describe('money :: lineSubtotal', () => {
  test('precio × cantidad', () => {
    expect(lineSubtotal(170, 3)).toBe(510);
  });
});

// ── computeOrderTotals (GUARDARRAÍL: total NO ignora modificadores) ──────────
describe('money :: computeOrderTotals', () => {
  // Caso real reportado: el modificador con precio ($30) desaparecía del total.
  // El subtotal debe dar $485.00 (no $455) — la línea Boneless vale 135+30.
  test('un modificador con precio NO se pierde en el total (ticket $485)', () => {
    // Boneless $135 base + "Papas Extra" $30 (grupo sin gratis) → línea $165.
    const selectedByGroup = new Map([
      ['g_extras', [{ id: 'm_papas', name: 'Papas Extra', groupId: 'g_extras', priceAdd: 30 }]],
    ]);
    const groupsById = new Map([['g_extras', { id: 'g_extras', freeModifiersLimit: 0 }]]);
    const { unitExtra } = applyFreeModifiers(selectedByGroup, groupsById);
    const bonelessLine = lineSubtotal(135 + unitExtra, 1);
    expect(bonelessLine).toBe(165); // sanity: el modificador entró en la línea

    const items = [
      { subtotal: bonelessLine },          // Boneless + Papas Extra = 165
      { subtotal: lineSubtotal(115, 1) },  // Hamburguesa
      { subtotal: lineSubtotal(105, 1) },  // Alitas
      { subtotal: lineSubtotal(30, 1) },   // Agua
      { subtotal: lineSubtotal(35, 1) },   // Refresco vidrio
      { subtotal: lineSubtotal(35, 1) },   // Refresco 600ml
    ];

    const { subtotal, total } = computeOrderTotals(items);
    expect(subtotal).toBe(485.0);
    expect(total).toBe(485.0);
    expect(subtotal).not.toBe(455); // el bug histórico (omitía el +$30)
  });

  test('el descuento se acota a [0, subtotal]', () => {
    expect(computeOrderTotals([{ subtotal: 100 }], { discount: 150 })).toEqual({
      subtotal: 100, discount: 100, total: 0,
    });
    expect(computeOrderTotals([{ subtotal: 100 }], { discount: -20 })).toEqual({
      subtotal: 100, discount: 0, total: 100,
    });
  });

  test('el deliveryFee se suma al total', () => {
    expect(computeOrderTotals([{ subtotal: 200 }], { discount: 20, deliveryFee: 35 })).toEqual({
      subtotal: 200, discount: 20, total: 215,
    });
  });

  test('redondea a 2 decimales (sin ruido de floats)', () => {
    const { subtotal } = computeOrderTotals([{ subtotal: 0.1 }, { subtotal: 0.2 }]);
    expect(subtotal).toBe(0.3);
  });

  test('lista vacía → todo en cero', () => {
    expect(computeOrderTotals([])).toEqual({ subtotal: 0, discount: 0, total: 0 });
  });
});

// ── summarizePayments ───────────────────────────────────────────────────────
describe('money :: summarizePayments', () => {
  test('agrupa por bucket según método de pago', () => {
    const orders = [
      { paymentMethod: 'CASH', total: 100 },
      { paymentMethod: 'CASH_ON_DELIVERY', total: 50 },
      { paymentMethod: 'CARD', total: 200 },
      { paymentMethod: 'CARD_PRESENT', total: 30 },
      { paymentMethod: 'SPEI', total: 40 },
      { paymentMethod: 'TRANSFER', total: 10 },
      { paymentMethod: 'COURTESY', total: 999 },
      { paymentMethod: 'UNKNOWN', total: 12345 }, // ignorado
    ];
    expect(summarizePayments(orders)).toEqual({
      totalCash: 150,
      totalCard: 230,
      totalTransfer: 50,
      totalCourtesy: 999,
    });
  });

  test('total como string se coacciona a número', () => {
    expect(summarizePayments([{ paymentMethod: 'CASH', total: '99.5' }]).totalCash).toBe(99.5);
  });

  test('lista vacía → todo en cero', () => {
    expect(summarizePayments([])).toEqual({
      totalCash: 0, totalCard: 0, totalTransfer: 0, totalCourtesy: 0,
    });
  });

  test('el mapa cubre todos los métodos esperados', () => {
    expect(Object.keys(PAYMENT_METHOD_MAP).sort()).toEqual(
      ['CARD', 'CARD_PRESENT', 'CASH', 'CASH_ON_DELIVERY', 'COURTESY', 'OXXO', 'SPEI', 'TRANSFER'].sort()
    );
  });
});

// ── cashCutSummary (corte de caja) ──────────────────────────────────────────
describe('money :: cashCutSummary', () => {
  test('efectivo esperado = apertura + ventas efectivo − gastos', () => {
    const { expectedCash } = cashCutSummary({
      openingFloat: 500,
      totalCash: 1200,
      totalExpenses: 300,
    });
    expect(expectedCash).toBe(1400);
  });

  test('varianza negativa = faltante de caja', () => {
    const { variance } = cashCutSummary({
      openingFloat: 500,
      totalCash: 1200,
      totalExpenses: 300,
      countedCash: 1350,
    });
    expect(variance).toBe(-50);
  });

  test('varianza positiva = sobrante de caja', () => {
    const { variance } = cashCutSummary({
      openingFloat: 0,
      totalCash: 1000,
      totalExpenses: 0,
      countedCash: 1010,
    });
    expect(variance).toBe(10);
  });

  test('sin efectivo contado, varianza es null (cierre ciego)', () => {
    expect(cashCutSummary({ openingFloat: 100, totalCash: 0, totalExpenses: 0 }).variance).toBeNull();
  });

  test('defaults a cero sin argumentos', () => {
    expect(cashCutSummary()).toEqual({ expectedCash: 0, variance: null });
  });

  test('ingresos de efectivo suman al esperado', () => {
    const { expectedCash } = cashCutSummary({
      openingFloat: 500,
      totalCash: 1200,
      totalExpenses: 300,
      totalCashIn: 200,
    });
    expect(expectedCash).toBe(1600);
  });

  test('ingreso de efectivo evita falso sobrante en el arqueo', () => {
    // El cajero metió $500 de cambio a la gaveta; sin registrarlo aparecería
    // como sobrante. Registrado, la caja cuadra.
    const { variance } = cashCutSummary({
      openingFloat: 0,
      totalCash: 1000,
      totalExpenses: 0,
      totalCashIn: 500,
      countedCash: 1500,
    });
    expect(variance).toBe(0);
  });
});
