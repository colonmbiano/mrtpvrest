'use strict';

// Tests de resolveRecipeFlatItems: elección de la receta por VARIANTE. La
// variante de un OrderItem puede venir en el nombre ("Alambre (350gr)") o en
// notes ("Variantes: Arrachera") — ambas fuentes se parsean con
// lib/parse-variant. Sin match → receta base; sin receta base → primera.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    recipe: { findMany: jest.fn() },
    recipeItem: { findMany: jest.fn() },
  },
}));

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => { req.user = { id: 'u1', restaurantId: 'r1', tenantId: 't1', role: 'ADMIN' }; next(); },
  requireAdmin: (_req, _res, next) => next(),
  requireTenantAccess: (_req, _res, next) => next(),
  requireRole: () => (_req, _res, next) => next(),
  requirePermission: () => (_req, _res, next) => next(),
  userHasPermission: () => true,
  hasValidOverride: () => false,
}));

jest.mock('../src/middleware/shift.middleware', () => ({
  requireActiveShift: (_req, _res, next) => next(),
}));

const { prisma } = require('@mrtpvrest/database');
const { resolveRecipeFlatItems } = require('../src/routes/orders.routes');

const RECIPES = [
  { id: 'rec-base', variantId: null, variant: null },
  { id: 'rec-arrachera', variantId: 'v1', variant: { name: 'Arrachera' } },
  { id: 'rec-pollo', variantId: 'v2', variant: { name: 'Pollo' } },
];

function mockChosen() {
  // Devuelve el recipeId con el que se consultaron los RecipeItems.
  const call = prisma.recipeItem.findMany.mock.calls.at(-1);
  return call[0].where.recipeId || null;
}

describe('resolveRecipeFlatItems — receta por variante', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.recipe.findMany.mockResolvedValue(RECIPES);
    prisma.recipeItem.findMany.mockResolvedValue([]);
  });

  it('variante en NOTES ("Variantes: X") elige la receta de esa variante', async () => {
    await resolveRecipeFlatItems(prisma, 'mi1', 'Alambre', 'r1', 'Sin cebolla\nVariantes: Arrachera');
    expect(mockChosen()).toBe('rec-arrachera');
  });

  it('variante embebida en el NOMBRE "(Pollo)" elige la receta de esa variante', async () => {
    await resolveRecipeFlatItems(prisma, 'mi1', 'Alambre (Pollo)', 'r1', null);
    expect(mockChosen()).toBe('rec-pollo');
  });

  it('sin variante reconocible cae a la receta base', async () => {
    await resolveRecipeFlatItems(prisma, 'mi1', 'Alambre', 'r1', 'Sin cebolla');
    expect(mockChosen()).toBe('rec-base');
  });

  it('texto libre en notes NO casa variantes por accidente', async () => {
    // "Arrachera" aparece en texto libre, no en la línea "Variantes:"; la
    // heurística legacy solo mira el NOMBRE, así que debe caer a la base.
    await resolveRecipeFlatItems(prisma, 'mi1', 'Alambre', 'r1', 'cliente pidió como la arrachera de ayer');
    expect(mockChosen()).toBe('rec-base');
  });

  it('sin receta base ni match usa la primera receta', async () => {
    prisma.recipe.findMany.mockResolvedValue([
      { id: 'rec-arrachera', variantId: 'v1', variant: { name: 'Arrachera' } },
      { id: 'rec-pollo', variantId: 'v2', variant: { name: 'Pollo' } },
    ]);
    await resolveRecipeFlatItems(prisma, 'mi1', 'Alambre', 'r1', null);
    expect(mockChosen()).toBe('rec-arrachera');
  });

  it('sin recetas formales cae al filtro legacy por menuItemId', async () => {
    prisma.recipe.findMany.mockResolvedValue([]);
    await resolveRecipeFlatItems(prisma, 'mi1', 'Alambre', 'r1', null);
    const where = prisma.recipeItem.findMany.mock.calls.at(-1)[0].where;
    expect(where.recipeId).toBeUndefined();
    expect(where.menuItemId).toBe('mi1');
  });
});
