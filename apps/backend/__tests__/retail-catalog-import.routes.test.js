'use strict';

// Tests del endpoint de alta masiva por CSV: POST /api/retail/v1/catalog/import.
// El parseo del CSV vive en el front (apps/moda/src/lib/csv-import.ts); aquí el
// backend recibe filas ya tipadas y hace upsert por producto+SKU. Cubrimos:
// crear, reusar producto cacheado, actualizar, tolerancia por fila y validación.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    retailProduct: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    retailSku: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { role: 'ADMIN', restaurantId: 'rest-1' };
    next();
  },
  requireTenantAccess: (_req, _res, next) => next(),
  requireRole: () => (_req, _res, next) => next(),
  userHasPermission: () => true,
  hasValidOverride: () => false,
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const retailRoutes = require('../src/routes/retail.routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/retail/v1', retailRoutes);
  return app;
}

const IMPORT_URL = '/api/retail/v1/catalog/import';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /catalog/import', () => {
  test('crea producto y SKU nuevos, filtrando por restaurantId', async () => {
    prisma.retailProduct.findFirst.mockResolvedValue(null);
    prisma.retailProduct.create.mockResolvedValue({ id: 'prod-1' });
    prisma.retailSku.findFirst.mockResolvedValue(null);
    prisma.retailSku.create.mockResolvedValue({ id: 'sku-1' });

    const res = await request(makeApp())
      .post(IMPORT_URL)
      .send({ rows: [{ producto: 'Camisa Oxford', sku: 'CAM-OXF-M-AZ', precio: 299, talla: 'M', color: 'Azul' }] })
      .expect(200);

    expect(res.body).toMatchObject({ productsCreated: 1, skusCreated: 1, skusUpdated: 0, errors: [] });
    expect(prisma.retailProduct.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { restaurantId: 'rest-1', name: 'Camisa Oxford' } }),
    );
    expect(prisma.retailSku.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          restaurantId: 'rest-1',
          productId: 'prod-1',
          sku: 'CAM-OXF-M-AZ',
          price: 299,
          size: 'M',
          color: 'Azul',
          unitOfMeasure: 'PZA',
        }),
      }),
    );
  });

  test('reusa el producto cacheado cuando varias filas comparten nombre', async () => {
    prisma.retailProduct.findFirst.mockResolvedValue(null);
    prisma.retailProduct.create.mockResolvedValue({ id: 'prod-1' });
    prisma.retailSku.findFirst.mockResolvedValue(null);
    prisma.retailSku.create.mockResolvedValue({ id: 'sku-x' });

    const res = await request(makeApp())
      .post(IMPORT_URL)
      .send({
        rows: [
          { producto: 'Camisa Oxford', sku: 'CAM-M', precio: 299, talla: 'M' },
          { producto: 'Camisa Oxford', sku: 'CAM-L', precio: 299, talla: 'L' },
        ],
      })
      .expect(200);

    expect(res.body).toMatchObject({ productsCreated: 1, skusCreated: 2, skusUpdated: 0 });
    // El producto se busca y se crea UNA sola vez (cache nombre→id).
    expect(prisma.retailProduct.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.retailProduct.create).toHaveBeenCalledTimes(1);
    expect(prisma.retailSku.create).toHaveBeenCalledTimes(2);
  });

  test('actualiza el SKU existente en vez de crearlo', async () => {
    prisma.retailProduct.findFirst.mockResolvedValue({ id: 'prod-1' });
    prisma.retailSku.findFirst.mockResolvedValue({ id: 'sku-existente' });
    prisma.retailSku.update.mockResolvedValue({ id: 'sku-existente' });

    const res = await request(makeApp())
      .post(IMPORT_URL)
      .send({ rows: [{ producto: 'Tornillo', sku: 'TOR-14', precio: 2.5, costo: 1.1 }] })
      .expect(200);

    expect(res.body).toMatchObject({ productsCreated: 0, skusCreated: 0, skusUpdated: 1, errors: [] });
    expect(prisma.retailSku.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sku-existente' },
        data: expect.objectContaining({ price: 2.5, cost: 1.1 }),
      }),
    );
    expect(prisma.retailSku.create).not.toHaveBeenCalled();
  });

  test('una fila que falla (SKU duplicado) no tumba el resto del lote', async () => {
    prisma.retailProduct.findFirst.mockResolvedValue({ id: 'prod-1' });
    prisma.retailSku.findFirst.mockResolvedValue(null);
    prisma.retailSku.create
      .mockResolvedValueOnce({ id: 'sku-ok' })
      .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));

    const res = await request(makeApp())
      .post(IMPORT_URL)
      .send({
        rows: [
          { producto: 'A', sku: 'OK-1', precio: 10 },
          { producto: 'A', sku: 'DUP-1', precio: 20 },
        ],
      })
      .expect(200);

    expect(res.body.skusCreated).toBe(1);
    expect(res.body.errors).toEqual([
      { row: 2, sku: 'DUP-1', message: 'SKU o código de barras duplicado' },
    ]);
  });

  test('rechaza payload sin filas (400)', async () => {
    await request(makeApp()).post(IMPORT_URL).send({ rows: [] }).expect(400);
    expect(prisma.retailSku.create).not.toHaveBeenCalled();
  });

  test('rechaza una fila sin precio (400)', async () => {
    await request(makeApp())
      .post(IMPORT_URL)
      .send({ rows: [{ producto: 'X', sku: 'X-1' }] })
      .expect(400);
    expect(prisma.retailProduct.create).not.toHaveBeenCalled();
  });
});
