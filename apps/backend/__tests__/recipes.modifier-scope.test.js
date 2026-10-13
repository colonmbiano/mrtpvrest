jest.mock('@mrtpvrest/database', () => ({ prisma: {
  modifier: { findFirst: jest.fn(), findMany: jest.fn() },
  menuItem: { findFirst: jest.fn() },
  modifierIngredient: { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
  ingredient: { findMany: jest.fn() }, subRecipe: { findMany: jest.fn() },
  recipe: { findFirst: jest.fn(), update: jest.fn() },
  recipeItem: { deleteMany: jest.fn(), createMany: jest.fn() },
  $transaction: jest.fn(),
} }));
jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, res, next) => { req.restaurantId = 'r'; next(); },
  requireAdmin: (req, res, next) => next(),
  requireTenantAccess: (req, res, next) => next(),
}));
jest.mock('../src/lib/modules', () => ({ requireFeatureFlag: () => (req, res, next) => next() }));
const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const app = express();
app.use(express.json());
app.use('/recipes', require('../src/routes/recipes.routes'));
const item = { ingredientId: 'ing', quantity: 80, unit: 'GRAM' };

beforeEach(() => {
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation(fn => fn(prisma));
  prisma.modifier.findFirst.mockResolvedValue({ id: 'mod' });
  prisma.modifier.findMany.mockResolvedValue([{ name: 'Protein', priceAdd: 0 }]);
  prisma.menuItem.findFirst.mockResolvedValue({ id: 'small' });
  prisma.modifierIngredient.findMany.mockResolvedValue([
    { name: 'Protein', menuItemId: null, quantity: 50 },
    { name: 'Protein', menuItemId: 'small', quantity: 80 },
  ]);
  prisma.ingredient.findMany.mockResolvedValue([{ id: 'ing', baseUnit: 'GRAM' }]);
  prisma.subRecipe.findMany.mockResolvedValue([]);
  prisma.recipe.findFirst.mockResolvedValue({ id: 'active', isActive: true });
  prisma.recipe.update.mockResolvedValue({ id: 'active' });
});
test.each([null, 'small'])('editing scope %s deletes only that scope', async menuItemId => {
  const res = await request(app).post('/recipes/modifiers').send({ name: 'Protein', menuItemId, items: [item] });
  expect(res.status).toBe(200);
  expect(prisma.modifierIngredient.deleteMany).toHaveBeenCalledWith({ where: { restaurantId: 'r', menuItemId, name: 'Protein' } });
  expect(prisma.modifierIngredient.createMany.mock.calls[0][0].data[0]).toEqual(expect.objectContaining({ restaurantId: 'r', menuItemId }));
});
test('global edit without menuItemId cannot erase scoped recipes', async () => {
  const res = await request(app).post('/recipes/modifiers').send({ name: 'Protein', items: [] });
  expect(res.status).toBe(200);
  expect(prisma.modifierIngredient.deleteMany.mock.calls[0][0].where.menuItemId).toBeNull();
});
test('scoped GET chooses product recipe and marks inheritance', async () => {
  const res = await request(app).get('/recipes/modifiers?menuItemId=small');
  expect(res.status).toBe(200);
  expect(res.body[0].items.map(i => i.quantity)).toEqual([80]);
  expect(res.body[0].inherited).toBe(false);
  prisma.modifierIngredient.findMany.mockResolvedValue([{ name: 'Protein', menuItemId: null, quantity: 50 }]);
  const fallback = await request(app).get('/recipes/modifiers?menuItemId=small');
  expect(fallback.body[0].inherited).toBe(true);
});
test('foreign product, foreign ingredient and wrong unit do not mutate mappings', async () => {
  prisma.modifier.findFirst.mockResolvedValue(null);
  expect((await request(app).post('/recipes/modifiers').send({ name: 'Protein', menuItemId: 'foreign', items: [item] })).status).toBe(404);
  prisma.modifier.findFirst.mockResolvedValue({ id: 'mod' });
  prisma.ingredient.findMany.mockResolvedValue([]);
  expect((await request(app).post('/recipes/modifiers').send({ name: 'Protein', items: [item] })).status).toBe(400);
  prisma.ingredient.findMany.mockResolvedValue([{ id: 'ing', baseUnit: 'PIECE' }]);
  expect((await request(app).post('/recipes/modifiers').send({ name: 'Protein', items: [item] })).status).toBe(400);
  expect(prisma.modifierIngredient.deleteMany).not.toHaveBeenCalled();
});
test('archived duplicate cannot win over active recipe on read or update', async () => {
  expect((await request(app).get('/recipes/by-menu-item/small')).status).toBe(200);
  expect(prisma.recipe.findFirst.mock.calls[0][0].orderBy[0]).toEqual({ isActive: 'desc' });
  expect((await request(app).post('/recipes').send({ menuItemId: 'small', items: [] })).status).toBe(200);
  const last = prisma.recipe.findFirst.mock.calls.at(-1)[0];
  expect(last.where).toEqual({ menuItemId: 'small', restaurantId: 'r', variantId: null });
  expect(last.orderBy[0]).toEqual({ isActive: 'desc' });
  expect(prisma.recipe.update.mock.calls[0][0].where.id).toBe('active');
});
