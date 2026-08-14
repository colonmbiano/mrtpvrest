'use strict';

// Validación del TTL por restaurante del barrido de mesas
// (PUT /api/admin/config → RestaurantConfig.tablePendingTtlMin).
//
// Semántica de los tres estados, que es lo fácil de romper:
//   null → usar el default global del backend
//   0    → barrido apagado para este restaurante
//   N    → minutos, topado a 15..1440

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    restaurantConfig: { upsert: jest.fn() },
    restaurant: { findUnique: jest.fn() },
  },
}));

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { role: 'ADMIN', restaurantId: 'r1' };
    req.restaurantId = 'r1';
    next();
  },
  requireTenantAccess: (_req, _res, next) => next(),
  requireAdmin: (_req, _res, next) => next(),
}));

jest.mock('../src/lib/promo', () => ({ resolveTrialDays: jest.fn() }));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const adminRoutes = require('../src/routes/admin.routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  return app;
}

async function putTtl(value) {
  await request(makeApp())
    .put('/api/admin/config')
    .send({ tablePendingTtlMin: value })
    .expect(200);
  return prisma.restaurantConfig.upsert.mock.calls[0][0].update.tablePendingTtlMin;
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.restaurantConfig.upsert.mockResolvedValue({ restaurantId: 'r1' });
});

describe('PUT /api/admin/config — tablePendingTtlMin', () => {
  it('un valor normal se guarda tal cual', async () => {
    expect(await putTtl(90)).toBe(90);
  });

  it('vacío → null (usar el default global)', async () => {
    expect(await putTtl('')).toBeNull();
  });

  it('null → null', async () => {
    expect(await putTtl(null)).toBeNull();
  });

  it('0 → 0 (barrido apagado, NO se confunde con "usar el default")', async () => {
    expect(await putTtl(0)).toBe(0);
  });

  it('negativo → 0 (apagado)', async () => {
    expect(await putTtl(-30)).toBe(0);
  });

  it('por debajo del mínimo → 15', async () => {
    expect(await putTtl(3)).toBe(15);
  });

  it('por encima del máximo → 1440', async () => {
    expect(await putTtl(99999)).toBe(1440);
  });

  it('texto no numérico → null', async () => {
    expect(await putTtl('cuando sea')).toBeNull();
  });

  it('decimal → se trunca a entero', async () => {
    expect(await putTtl(45.9)).toBe(45);
  });
});
