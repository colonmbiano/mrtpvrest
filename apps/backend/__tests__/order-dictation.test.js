'use strict';

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    menuItem: { findMany: jest.fn() },
  },
}));

const { prisma } = require('@mrtpvrest/database');
const {
  parseQuantity,
  parseWeightKg,
  runOrderDictation,
  splitPrompt,
  resolveSelections,
  buildSelectionsFromResolved,
  fuzzyEqual,
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

  it('separa varios productos por cantidad aunque no haya comas (dictado de voz)', () => {
    expect(splitPrompt('una hamburguesa dos cocas')).toEqual([
      'una hamburguesa',
      'dos cocas',
    ]);
    expect(splitPrompt('una coca y unas papas')).toEqual([
      'una coca',
      'unas papas',
    ]);
    expect(parseQuantity('unas papas')).toBe(1);
    expect(parseQuantity('par de cervezas')).toBe(2);
  });

  it('no parte un nombre que contiene un conector (Café y Té)', () => {
    // Sin cantidad intermedia, "café y té" queda como un solo segmento.
    expect(splitPrompt('un cafe y te')).toEqual(['un cafe te']);
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

  it('prefiere Taco al pastor sobre el producto generico Tacos', async () => {
    prisma.menuItem.findMany.mockResolvedValueOnce([
      item({ id: 'tacos', name: 'Tacos', price: 20 }),
      item({ id: 'pastor', name: 'Taco al pastor', price: 22 }),
    ]);

    const result = await runOrderDictation({
      restaurantId: 'rest1',
      prompt: 'dos tacos de pastor',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      menuItemId: 'pastor',
      quantity: 2,
      needsReview: false,
    });
  });

  it('selecciona Pastor cuando Tacos usa variantes', async () => {
    prisma.menuItem.findMany.mockResolvedValueOnce([
      item({
        id: 'tacos',
        name: 'Tacos',
        price: 20,
        hasVariants: true,
        variants: [
          { id: 'pastor', name: 'Pastor', price: 22, isAvailable: true },
          { id: 'bistec', name: 'Bistec', price: 24, isAvailable: true },
        ],
      }),
    ]);

    const result = await runOrderDictation({
      restaurantId: 'rest1',
      prompt: 'tres tacos de pastor',
    });

    expect(result.items[0]).toMatchObject({
      menuItemId: 'tacos',
      quantity: 3,
      needsReview: false,
      selections: {
        selectedVariant: { id: 'pastor', name: 'Pastor', price: 22 },
        unitPrice: 22,
      },
    });
  });

  it('mantiene revision si el dictado no incluye la variante requerida', async () => {
    prisma.menuItem.findMany.mockResolvedValueOnce([
      item({
        id: 'tacos',
        name: 'Tacos',
        price: 20,
        hasVariants: true,
        variants: [
          { id: 'pastor', name: 'Pastor', price: 22, isAvailable: true },
          { id: 'bistec', name: 'Bistec', price: 24, isAvailable: true },
        ],
      }),
    ]);

    const result = await runOrderDictation({
      restaurantId: 'rest1',
      prompt: 'dos tacos',
    });

    expect(result.items[0].selections.selectedVariant).toBeNull();
    expect(result.items[0].needsReview).toBe(true);
  });

  it('selecciona Pastor cuando es un modificador obligatorio de Tacos', async () => {
    prisma.menuItem.findMany.mockResolvedValueOnce([
      item({
        id: 'tacos',
        name: 'Tacos',
        price: 20,
        modifierGroups: [{
          id: 'proteina',
          name: 'Proteina',
          required: true,
          multiSelect: false,
          minSelection: 1,
          maxSelection: 1,
          freeModifiersLimit: 0,
          modifiers: [
            { id: 'pastor', groupId: 'proteina', name: 'Pastor', priceAdd: 0 },
            { id: 'bistec', groupId: 'proteina', name: 'Bistec', priceAdd: 3 },
          ],
        }],
      }),
    ]);

    const result = await runOrderDictation({
      restaurantId: 'rest1',
      prompt: 'cuatro tacos de pastor',
    });

    expect(result.items[0]).toMatchObject({
      quantity: 4,
      needsReview: false,
      selections: {
        selectedModifiers: [
          { id: 'pastor', groupId: 'proteina', name: 'Pastor', priceAdd: 0 },
        ],
        unitPrice: 20,
      },
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

describe('order dictation — cantidades extendidas', () => {
  it('parsea numeros grandes y por docenas', () => {
    expect(parseQuantity('veinticinco alitas')).toBe(25);
    expect(parseQuantity('treinta tacos')).toBe(30);
    expect(parseQuantity('cincuenta tacos')).toBe(50);
    expect(parseQuantity('una docena de tacos')).toBe(12);
    expect(parseQuantity('dos docenas de tacos')).toBe(24);
    expect(parseQuantity('media docena de alitas')).toBe(6);
    expect(parseQuantity('docena de gorditas')).toBe(12);
  });

  it('no parte "media docena" en dos segmentos', () => {
    expect(splitPrompt('media docena de alitas')).toEqual(['media docena de alitas']);
    // Pero sí separa productos distintos por cantidad.
    expect(splitPrompt('una docena de tacos y dos cocas')).toEqual([
      'una docena de tacos',
      'dos cocas',
    ]);
  });
});

describe('order dictation — sinonimos coloquiales (motor de reglas)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mapea bebidas coloquiales al generico del menu', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      item({ id: 'refr', name: 'Refrescos', price: 25 }),
      item({ id: 'cerv', name: 'Cerveza', price: 35 }),
      item({ id: 'agua', name: 'Agua embotellada', price: 18 }),
    ]);

    const coca = await runOrderDictation({ restaurantId: 'r1', prompt: 'una coca' });
    expect(coca.items).toHaveLength(1);
    expect(coca.items[0].menuItemId).toBe('refr');

    const chelas = await runOrderDictation({ restaurantId: 'r1', prompt: 'dos chelas' });
    expect(chelas.items[0]).toMatchObject({ menuItemId: 'cerv', quantity: 2 });

    const sprite = await runOrderDictation({ restaurantId: 'r1', prompt: 'un sprite' });
    expect(sprite.items[0].menuItemId).toBe('refr');
  });

  it('mapea tallas coloquiales a la variante correcta', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      item({
        id: 'pizza',
        name: 'Pizza',
        hasVariants: true,
        variants: [
          { id: 'g', name: 'Grande', price: 150, isAvailable: true },
          { id: 'm', name: 'Mediana', price: 120, isAvailable: true },
          { id: 'c', name: 'Chica', price: 90, isAvailable: true },
        ],
      }),
    ]);

    const mediana = await runOrderDictation({ restaurantId: 'r1', prompt: 'una pizza mediana' });
    expect(mediana.items[0].selections.selectedVariant).toMatchObject({ id: 'm', name: 'Mediana' });
    expect(mediana.items[0].needsReview).toBe(false);

    const familiar = await runOrderDictation({ restaurantId: 'r1', prompt: 'una pizza familiar' });
    expect(familiar.items[0].selections.selectedVariant).toMatchObject({ id: 'g', name: 'Grande' });
  });
});

describe('order dictation — fuzzy match (errores de transcripcion)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fuzzyEqual tolera 1-2 ediciones en palabras largas', () => {
    expect(fuzzyEqual('hamburgesa', 'hamburguesa')).toBe(true);
    expect(fuzzyEqual('boneles', 'boneless')).toBe(true);
    expect(fuzzyEqual('coca', 'cafe')).toBe(false);
    expect(fuzzyEqual('te', 'de')).toBe(false); // palabras < 4 chars: nunca
  });

  it('resuelve un producto aunque el STT lo transcriba con error', async () => {
    prisma.menuItem.findMany.mockResolvedValueOnce([
      item({ id: 'h1', name: 'Hamburguesa' }),
    ]);

    const result = await runOrderDictation({ restaurantId: 'r1', prompt: 'una hamburgesa' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].menuItemId).toBe('h1');
  });
});

describe('order dictation — normalizacion de selecciones (motor IA)', () => {
  const product = {
    id: 'p1',
    name: 'Tacos',
    price: 20,
    promoPrice: null,
    variants: [
      { id: 'v1', name: 'Grande', price: 30, isAvailable: true },
      { id: 'v2', name: 'Chico', price: 18, isAvailable: true },
    ],
    complements: [{ id: 'c1', name: 'Guacamole', price: 15, isAvailable: true }],
    modifierGroups: [
      {
        id: 'g1',
        name: 'Extras',
        required: false,
        multiSelect: true,
        minSelection: 0,
        maxSelection: 3,
        freeModifiersLimit: 0,
        modifiers: [
          { id: 'm1', groupId: 'g1', name: 'Queso extra', priceAdd: 10 },
          { id: 'm2', groupId: 'g1', name: 'Tocino', priceAdd: 12 },
        ],
      },
    ],
  };

  it('resolveSelections mapea nombres de IA a IDs reales', () => {
    const sel = resolveSelections(product, 'Grande', ['Queso extra', 'Guacamole']);
    expect(sel.variantId).toBe('v1');
    expect(sel.modifierIds).toEqual(['m1', 'complement:c1']);
  });

  it('buildSelectionsFromResolved arma el shape selections con precio correcto', () => {
    const selections = buildSelectionsFromResolved(product, 'v1', ['m1', 'complement:c1']);
    expect(selections.selectedVariant).toMatchObject({ id: 'v1', name: 'Grande', price: 30 });
    expect(selections.selectedModifiers).toEqual([
      { id: 'm1', groupId: 'g1', name: 'Queso extra', priceAdd: 10 },
    ]);
    expect(selections.selectedComplements).toEqual([
      { id: 'c1', name: 'Guacamole', price: 15 },
    ]);
    // 30 (variante Grande) + 10 (queso extra) + 15 (guacamole) = 55
    expect(selections.unitPrice).toBe(55);
  });

  it('buildSelectionsFromResolved sin variante usa precio base/promo', () => {
    const selections = buildSelectionsFromResolved(product, null, []);
    expect(selections.selectedVariant).toBeNull();
    expect(selections.unitPrice).toBe(20);
  });
});

describe('order dictation — venta por peso (báscula)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('parseWeightKg interpreta expresiones de peso', () => {
    expect(parseWeightKg('medio kilo de alitas')).toBe(0.5);
    expect(parseWeightKg('un kilo de alitas')).toBe(1);
    expect(parseWeightKg('kilo y medio de alitas')).toBe(1.5);
    expect(parseWeightKg('dos kilos')).toBe(2);
    expect(parseWeightKg('500 gramos')).toBe(0.5);
    expect(parseWeightKg('cuarto de kilo')).toBe(0.25);
    expect(parseWeightKg('tres cuartos de kilo')).toBe(0.75);
    expect(parseWeightKg('kilo de alitas')).toBe(1);
    expect(parseWeightKg('dos tacos')).toBeNull();
  });

  it('asigna weightKg a productos soldByWeight (quantity queda en 1)', async () => {
    prisma.menuItem.findMany.mockResolvedValueOnce([
      item({ id: 'alitas', name: 'Alitas por kilo', price: 280, soldByWeight: true }),
    ]);
    const result = await runOrderDictation({
      restaurantId: 'r1',
      prompt: 'medio kilo de alitas',
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ menuItemId: 'alitas', quantity: 1, weightKg: 0.5 });
  });

  it('producto normal ignora el peso y usa cantidad', async () => {
    prisma.menuItem.findMany.mockResolvedValueOnce([
      item({ id: 'taco', name: 'Tacos', price: 20 }),
    ]);
    const result = await runOrderDictation({ restaurantId: 'r1', prompt: 'dos tacos' });
    expect(result.items[0]).toMatchObject({ quantity: 2, weightKg: null });
  });
});
