'use strict';

jest.mock('@mrtpvrest/database', () => ({ prisma: {
  restaurant: { findUnique: jest.fn() },
  location: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  $transaction: jest.fn(),
} }));
jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => { req.user = { role: req.headers['x-test-role'] || 'ADMIN', restaurantId: 'r1' }; req.restaurantId = 'r1'; next(); },
  requireTenantAccess: (_req, _res, next) => next(),
  requireAdmin: (req, res, next) => req.user.role === 'ADMIN' ? next() : res.status(403).json({ error: 'Acceso restringido' }),
}));
jest.mock('../src/lib/promo', () => ({ resolveTrialDays: jest.fn() }));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const adminRoutes = require('../src/routes/admin.routes');
const { locationCoordinates } = require('../src/lib/location-coordinates');

function app() { const value = express(); value.use(express.json()); value.use('/api/admin', adminRoutes); return value; }
beforeEach(() => {
  jest.clearAllMocks();
  prisma.restaurant.findUnique.mockResolvedValue({ id: 'r1', name: 'Tienda', maxLocations: 5, _count: { locations: 1 } });
  prisma.location.findUnique.mockResolvedValue({ id: 'l1', restaurantId: 'r1' });
  prisma.location.create.mockImplementation(async ({ data }) => ({ id: 'new', ...data }));
  prisma.location.update.mockImplementation(async ({ data }) => ({ id: 'l1', ...data }));
  prisma.$transaction.mockImplementation(work => work(prisma));
});

test('crear una sucursal con coordenadas válidas conserva el restaurante autenticado', async () => {
  const response = await request(app()).post('/api/admin/locations').send({ name: 'Centro', slug: 'centro', latitude: 19.43, longitude: -99.13, restaurantId: 'otro' }).expect(200);
  expect(response.body).toMatchObject({ latitude: 19.43, longitude: -99.13, restaurantId: 'r1' });
});
test('la sucursal sin coordenadas sigue pudiendo crearse', async () => {
  await request(app()).post('/api/admin/locations').send({ name: 'Centro', slug: 'centro' }).expect(200);
  expect(prisma.location.create.mock.calls[0][0].data).not.toHaveProperty('latitude');
});
test('actualizar usa alcance de restaurante y acepta cero y los límites geográficos', async () => {
  await request(app()).put('/api/admin/locations/l1').send({ latitude: 0, longitude: -180 }).expect(200);
  expect(prisma.location.update).toHaveBeenCalledWith({ where: { id: 'l1', restaurantId: 'r1' }, data: { latitude: 0, longitude: -180 } });
  expect(locationCoordinates({ latitude: 90, longitude: 180 })).toEqual({ latitude: 90, longitude: 180 });
});
test('borrar ambas coordenadas es explícito y no cambia otros campos', async () => {
  await request(app()).put('/api/admin/locations/l1').send({ latitude: null, longitude: null }).expect(200);
  expect(prisma.location.update.mock.calls[0][0].data).toEqual({ latitude: null, longitude: null });
});
test('editar otros campos no borra coordenadas existentes', async () => {
  await request(app()).put('/api/admin/locations/l1').send({ name: 'Nuevo nombre' }).expect(200);
  expect(prisma.location.update.mock.calls[0][0].data).toEqual({ name: 'Nuevo nombre' });
});
test.each([
  { latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 },
  { latitude: '19', longitude: '-99' }, { latitude: true, longitude: false },
  { latitude: 19 }, { latitude: null, longitude: -99 },
])('rechaza coordenadas inválidas o incompletas %j sin escribir', async body => {
  const response = await request(app()).put('/api/admin/locations/l1').send(body).expect(400);
  expect(response.body.errorCode).toBe('INVALID_LOCATION_COORDINATES');
  expect(prisma.location.update).not.toHaveBeenCalled();
});
test('rechaza NaN e infinito desde llamadas internas', () => {
  for (const value of [NaN, Infinity, -Infinity]) expect(() => locationCoordinates({ latitude: value, longitude: 0 })).toThrow();
});
test('no modifica una sucursal ajena aunque el cuerpo use el restaurante propio', async () => {
  prisma.location.findUnique.mockResolvedValue({ id: 'l2', restaurantId: 'r2' });
  await request(app()).put('/api/admin/locations/l2').send({ restaurantId: 'r1', latitude: 19, longitude: -99 }).expect(404);
  expect(prisma.location.update).not.toHaveBeenCalled();
});
test('un repartidor no puede cambiar coordenadas', async () => {
  await request(app()).put('/api/admin/locations/l1').set('x-test-role', 'DELIVERY').send({ latitude: 19, longitude: -99 }).expect(403);
  expect(prisma.location.findUnique).not.toHaveBeenCalled();
});
