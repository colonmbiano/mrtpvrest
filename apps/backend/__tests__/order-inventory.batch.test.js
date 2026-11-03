'use strict';

// Fija el contrato BATCHEADO del consumo de inventario al cobrar.
// consumePaidOrder corre dentro de la $transaction del cobro (con {timeout:30000}).
// Antes hacía N+1 (combos/modificadores por ítem + por ingrediente: updateMany +
// findFirst + stockMovement.create), lo que bajo BD cross-región reventaba los 30s
// y encolaba los tickets. Ahora: lecturas de combos/modificadores con where.in,
// caché de receta, balanceAfter en memoria (sin findFirst) y stockMovement.createMany.

const { consumePaidOrder } = require('../src/services/order-inventory.service');

const ING1 = { id: 'ING1', name: 'Carne', stock: 1000, cost: 0.5, baseUnit: 'GRAM', locationId: 'locX', isPackaging: false, restaurantId: 'r1' };
const ING2 = { id: 'ING2', name: 'Queso', stock: 500, cost: 0.2, baseUnit: 'GRAM', locationId: 'locX', isPackaging: false, restaurantId: 'r1' };

// Dos líneas del MISMO producto (miA): receta = 100g de ING1 por unidad.
// oiA (x2) lleva además el modificador "Extra Queso" = 50g de ING2 por unidad.
const ITEMS = [
  { id: 'oiA', menuItemId: 'miA', name: 'Tacos', notes: null, quantity: 2, weightKg: null, costSnapshot: null },
  { id: 'oiB', menuItemId: 'miA', name: 'Tacos', notes: null, quantity: 1, weightKg: null, costSnapshot: null },
];

function makeTx() {
  return {
    order: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue({
        id: 'ord1', paymentStatus: 'PAID', status: 'DELIVERED', orderType: 'TAKEOUT',
        locationId: 'locX', packagingPlan: null, items: ITEMS,
      }),
    },
    menuItem: { findMany: jest.fn().mockResolvedValue([]) },          // sin productos de empaque
    comboSelection: { findMany: jest.fn().mockResolvedValue([]) },    // sin combos
    orderItemModifier: { findMany: jest.fn().mockResolvedValue([{ orderItemId: 'oiA', name: 'Extra Queso', modifierId: 'mod1' }]) },
    modifier: { findMany: jest.fn().mockResolvedValue([{ id: 'mod1', group: { groupType: 'SINGLE', maxSelection: 0 } }]) },
    modifierIngredient: { findMany: jest.fn().mockResolvedValue([
      { name: 'Extra Queso', wastagePercent: 0, quantity: 50, ingredientId: 'ING2', ingredient: ING2, subRecipeId: null, menuItemId: null },
    ]) },
    recipe: { findMany: jest.fn().mockResolvedValue([{ id: 'rec1', variantId: null, variant: null }]) },
    recipeItem: { findMany: jest.fn().mockResolvedValue([
      { recipeId: 'rec1', quantity: 100, wastagePercent: 0, ingredientId: 'ING1', ingredient: ING1, subRecipeId: null },
    ]) },
    subRecipe: { findFirst: jest.fn().mockResolvedValue(null) },
    restaurantConfig: { findUnique: jest.fn().mockResolvedValue({ blockOnInsufficientStock: false }) },
    ingredient: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null), // no debe usarse
      findMany: jest.fn().mockResolvedValue([]),
    },
    stockMovement: { create: jest.fn(), createMany: jest.fn().mockResolvedValue({ count: 3 }) },
    orderItem: { update: jest.fn().mockResolvedValue({}) },
  };
}

describe('consumePaidOrder — lecturas batcheadas (sin N+1)', () => {
  it('combos y modificadores se leen UNA vez para toda la orden, con where.in', async () => {
    const tx = makeTx();
    await consumePaidOrder(tx, 'ord1', 'r1');
    expect(tx.comboSelection.findMany).toHaveBeenCalledTimes(1);
    expect(tx.orderItemModifier.findMany).toHaveBeenCalledTimes(1);
    expect(tx.comboSelection.findMany.mock.calls[0][0].where.orderItemId.in).toEqual(['oiA', 'oiB']);
    expect(tx.orderItemModifier.findMany.mock.calls[0][0].where.orderItemId.in).toEqual(['oiA', 'oiB']);
  });

  it('la misma receta no se re-resuelve por línea repetida (caché)', async () => {
    const tx = makeTx();
    await consumePaidOrder(tx, 'ord1', 'r1');
    expect(tx.recipe.findMany).toHaveBeenCalledTimes(1);
    expect(tx.recipeItem.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('consumePaidOrder — escrituras batcheadas', () => {
  it('inserta los StockMovement en bloque (createMany) y NO re-lee stock por ingrediente', async () => {
    const tx = makeTx();
    await consumePaidOrder(tx, 'ord1', 'r1');
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(tx.ingredient.findFirst).not.toHaveBeenCalled();
    expect(tx.stockMovement.createMany).toHaveBeenCalledTimes(1);

    const movs = tx.stockMovement.createMany.mock.calls[0][0].data;
    expect(movs).toHaveLength(3); // ING1@oiA, ING2@oiA, ING1@oiB
    const ing1A = movs.find(m => m.ingredientId === 'ING1' && m.notes === 'Venta orderItem oiA');
    const ing2A = movs.find(m => m.ingredientId === 'ING2' && m.notes === 'Venta orderItem oiA');
    const ing1B = movs.find(m => m.ingredientId === 'ING1' && m.notes === 'Venta orderItem oiB');
    expect(ing1A.delta).toBeCloseTo(-200);
    expect(ing1A.balanceAfter).toBeCloseTo(800); // 1000 - 200
    expect(ing2A.delta).toBeCloseTo(-100);
    expect(ing2A.balanceAfter).toBeCloseTo(400); // 500 - 100
    expect(ing1B.delta).toBeCloseTo(-100);
    expect(ing1B.balanceAfter).toBeCloseTo(700); // saldo en vivo: 800 - 100
    for (const m of movs) {
      expect(m.reason).toBe('SALE');
      expect(m.refType).toBe('order');
      expect(m.refId).toBe('ord1');
    }
  });

  it('decrementa cada ingrediente (updateMany) y guarda costSnapshot por ítem', async () => {
    const tx = makeTx();
    await consumePaidOrder(tx, 'ord1', 'r1');
    // ING1 en oiA (x2) y oiB (x1) → 2 decrementos; ING2 en oiA → 1. Total 3.
    expect(tx.ingredient.updateMany).toHaveBeenCalledTimes(3);
    const byItem = Object.fromEntries(tx.orderItem.update.mock.calls.map(([a]) => [a.where.id, a.data.costSnapshot]));
    expect(byItem.oiA).toBeCloseTo(60); // 100g×0.5 + 50g×0.2
    expect(byItem.oiB).toBeCloseTo(50); // 100g×0.5
  });

  it('no consume una orden ya cobrada sin ítems pendientes', async () => {
    const tx = makeTx();
    tx.order.findFirst.mockResolvedValue({
      id: 'ord1', paymentStatus: 'PAID', status: 'DELIVERED', orderType: 'TAKEOUT',
      locationId: 'locX', packagingPlan: null,
      items: ITEMS.map(i => ({ ...i, costSnapshot: 1 })), // ya consumidos
    });
    await consumePaidOrder(tx, 'ord1', 'r1');
    expect(tx.comboSelection.findMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.createMany).not.toHaveBeenCalled();
  });
});
