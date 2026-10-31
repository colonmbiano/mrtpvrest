'use strict';

// Tests de GET /api/store/menu: los productos de una categoría inactiva no se
// muestran (ni en web ni en kiosko); el grupo "Menú" queda solo para datos
// inconsistentes con categoría activa ajena a la lista.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    restaurant: { findUnique: jest.fn() },
    category: { findMany: jest.fn() },
    menuItem: { findMany: jest.fn() },
    restaurantConfig: { findUnique: jest.fn() },
  },
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const storeRoutes = require('../src/routes/store.routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/store', storeRoutes);
  return app;
}

const item = (id, categoryId) => ({ id, name: id, price: 10, isPromo: false, categoryId, _count: { reactions: 0 } });

beforeEach(() => {
  jest.clearAllMocks();
  prisma.restaurant.findUnique.mockResolvedValue({ id: 'r1', slug: 'tacos', isActive: true });
  prisma.category.findMany.mockResolvedValue([{ id: 'c1', name: 'Tacos', sortOrder: 0 }]);
  prisma.restaurantConfig.findUnique.mockResolvedValue(null);
});

describe('GET /api/store/menu', () => {
  test('solo pide productos de categorías activas, en web y en kiosko', async () => {
    prisma.menuItem.findMany.mockResolvedValue([]);

    await request(makeApp()).get('/api/store/menu?r=tacos');
    await request(makeApp()).get('/api/store/menu?r=tacos&source=KIOSK');

    const [web, kiosk] = prisma.menuItem.findMany.mock.calls.map(([args]) => args.where);
    expect(web).toMatchObject({ restaurantId: 'r1', isAvailable: true, availableOnline: true, category: { is: { isActive: true } } });
    expect(kiosk).toMatchObject({ restaurantId: 'r1', isAvailable: true, availableOnKiosk: true, category: { is: { isActive: true } } });
  });

  test('agrupa por categoría y deja "Menú" solo para categorías activas fuera de la lista', async () => {
    prisma.menuItem.findMany.mockResolvedValue([item('i1', 'c1'), item('i2', 'otra')]);

    const res = await request(makeApp()).get('/api/store/menu?r=tacos');

    expect(res.status).toBe(200);
    expect(res.body.categories.map((c) => [c.name, c.items.map((i) => i.id)])).toEqual([
      ['Tacos', ['i1']],
      ['Menú', ['i2']],
    ]);
  });

  test('sin huérfanos no agrega el grupo "Menú"', async () => {
    prisma.menuItem.findMany.mockResolvedValue([item('i1', 'c1')]);

    const res = await request(makeApp()).get('/api/store/menu?r=tacos');

    expect(res.body.categories.map((c) => c.name)).toEqual(['Tacos']);
  });
});
