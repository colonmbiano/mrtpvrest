'use strict';

// Tests de POST /api/store/menu/:itemId/react — "me gusta" anónimo de un
// platillo en la tienda pública. Sin auth; scoped por el slug de la tienda.
// El @@unique(menuItemId, clientId) impide contar doble (createMany skipDuplicates).

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    restaurant: { findUnique: jest.fn() },
    menuItem: { findFirst: jest.fn() },
    dishReaction: { createMany: jest.fn(), deleteMany: jest.fn(), count: jest.fn() },
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

beforeEach(() => {
  jest.clearAllMocks();
  prisma.restaurant.findUnique.mockResolvedValue({ id: 'r1', slug: 'tacos', isActive: true });
  prisma.menuItem.findFirst.mockResolvedValue({ id: 'item1' });
});

describe('POST /api/store/menu/:itemId/react', () => {
  test('reacciona (on por defecto) y devuelve el conteo', async () => {
    prisma.dishReaction.count.mockResolvedValue(5);

    const res = await request(makeApp())
      .post('/api/store/menu/item1/react?r=tacos')
      .send({ clientId: 'browser-abc' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reactionCount: 5, reacted: true });
    // Idempotente: createMany con skipDuplicates, restaurantId explícito.
    expect(prisma.dishReaction.createMany).toHaveBeenCalledWith({
      data: [{ restaurantId: 'r1', menuItemId: 'item1', clientId: 'browser-abc' }],
      skipDuplicates: true,
    });
    expect(prisma.dishReaction.deleteMany).not.toHaveBeenCalled();
  });

  test('quita la reacción con on:false', async () => {
    prisma.dishReaction.count.mockResolvedValue(4);

    const res = await request(makeApp())
      .post('/api/store/menu/item1/react?r=tacos')
      .send({ clientId: 'browser-abc', on: false });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reactionCount: 4, reacted: false });
    expect(prisma.dishReaction.deleteMany).toHaveBeenCalledWith({ where: { menuItemId: 'item1', clientId: 'browser-abc' } });
    expect(prisma.dishReaction.createMany).not.toHaveBeenCalled();
  });

  test('sin clientId responde 400', async () => {
    const res = await request(makeApp())
      .post('/api/store/menu/item1/react?r=tacos')
      .send({});

    expect(res.status).toBe(400);
    expect(prisma.dishReaction.createMany).not.toHaveBeenCalled();
  });

  test('platillo de otra tienda → 404', async () => {
    prisma.menuItem.findFirst.mockResolvedValue(null);

    const res = await request(makeApp())
      .post('/api/store/menu/ajeno/react?r=tacos')
      .send({ clientId: 'browser-abc' });

    expect(res.status).toBe(404);
    // La búsqueda del platillo va scoped al restaurante de la tienda.
    expect(prisma.menuItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ajeno', restaurantId: 'r1' } })
    );
  });
});
