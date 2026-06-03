'use strict';

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    menuItem: { findMany: jest.fn() },
  },
}));

const { prisma } = require('@mrtpvrest/database');
const {
  parseQuantity,
  runOrderDictation,
  splitPrompt,
} = require('../src/services/order-dictation.service');

function item(overrides) {
  return {
    id: overrides.id,
    name: overrides.name,
    price: overrides.price ?? 50,
    promoPrice: overrides.promoPrice ?? null,
    imageUrl: null,
    categoryId: 'cat1',
    category: { id: 'cat1', name: 'Menu' },
    isPromo: false,
    isPopular: false,
    isFavorite: false,
    isAvailable: true,
    activeDays: [],
    hasVariants: false,
    variantMultiSelect: false,
    variantMinSelection: 0,
    variantMaxSelection: 0,
    variants: [],
    complements: [],
    modifierGroups: [],
    ...overrides,
  };
}

describe('order dictation service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parsea cantidades habladas y separa conectores antes de cantidad', () => {
    expect(parseQuantity('dos tacos')).toBe(2);
    expect(parseQuantity('3 cocas')).toBe(3);
    expect(splitPrompt('dos tacos sin cebolla y una coca')).toEqual([
      'dos tacos sin cebolla',
      'una coca',
    ]);
  });

  it('mapea productos reales, cantidades y notas al ticket', async () => {
    prisma.menuItem.findMany.mockResolvedValueOnce([
      item({ id: 'taco1', name: 'Taco al pastor', price: 22 }),
      item({ id: 'coca1', name: 'Coca Cola 600ml', price: 28 }),
    ]);

    const result = await runOrderDictation({
      restaurantId: 'rest1',
      prompt: 'dos tacos sin cebolla y una coca',
    });

    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      menuItemId: 'taco1',
      quantity: 2,
      notes: 'sin cebolla',
    });
    expect(result.items[1]).toMatchObject({
      menuItemId: 'coca1',
      quantity: 1,
    });
  });

  it('marca revision cuando el producto tiene variantes o modificadores requeridos', async () => {
    prisma.menuItem.findMany.mockResolvedValueOnce([
      item({
        id: 'alitas1',
        name: 'Alitas',
        hasVariants: true,
        variants: [{ id: 'bbq', name: 'BBQ', price: 99 }],
      }),
    ]);

    const result = await runOrderDictation({
      restaurantId: 'rest1',
      prompt: 'una alitas',
    });

    expect(result.items[0].needsReview).toBe(true);
  });

  it('no inventa productos cuando no hay match suficiente', async () => {
    prisma.menuItem.findMany.mockResolvedValueOnce([
      item({ id: 'cafe1', name: 'Cafe americano' }),
    ]);

    const result = await runOrderDictation({
      restaurantId: 'rest1',
      prompt: 'dos focos azules',
    });

    expect(result.ok).toBe(false);
    expect(result.items).toHaveLength(0);
    expect(result.unresolved).toEqual(['dos focos azules']);
  });
});
