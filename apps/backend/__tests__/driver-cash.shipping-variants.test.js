'use strict';

// Test del desglose de ENVÍOS por variante/zona del turno del repartidor
// (GET /api/driver-cash/:driverId/orders → summary.shippingByVariant).
//
// La variante elegida (Lluvia, Noche, local, zona extendida…) NO está en el
// nombre del renglón: vive en la línea "Variantes: …" de las notas, que pueden
// ser multilínea e incluso traer texto libre que NO es la variante
// ("Lluvia\nVariantes: zona extendida" → la variante real es "zona extendida").
// Los renglones de envío se detectan por categoría (Envios), igual que el reporte.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    employee: { findFirst: jest.fn() },
    driverCashCut: { findFirst: jest.fn() },
    order: { findMany: jest.fn() },
    category: { findMany: jest.fn() },
  },
}));

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'u1', name: 'Dueño', restaurantId: 'r1', role: 'OWNER' };
    req.restaurantId = 'r1';
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
  requireTenantAccess: (_req, _res, next) => next(),
  requireRole: () => (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const driverCashRoutes = require('../src/routes/driver-cash.routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/driver-cash', driverCashRoutes);
  return app;
}

// Renglón de envío con la variante en notas.
const ship = (price, notes) => ({
  name: 'envios', quantity: 1, price, subtotal: price, notes,
  menuItem: { categoryId: 'catEnv' },
});
// Renglón de comida (no envío).
const food = (name, price) => ({
  name, quantity: 1, price, subtotal: price, notes: null,
  menuItem: { categoryId: 'catComida' },
});
const order = (orderNumber, total, items) => ({
  id: 'o-' + orderNumber, orderNumber, status: 'DELIVERED',
  paymentMethod: 'CASH', paymentStatus: 'PENDING', total,
  deliveryFee: 0, tip: 0, cashCollected: false,
  customerName: 'Cliente ' + orderNumber, ticketName: null, customerPhone: null,
  deliveryAddress: null, createdAt: new Date('2026-06-21T05:00:00Z'), items,
});

beforeEach(() => {
  jest.clearAllMocks();
  prisma.employee.findFirst.mockResolvedValue({ id: 'd1', name: 'Mau', locationId: 'loc1' });
  prisma.driverCashCut.findFirst.mockResolvedValue(null); // sin corte previo → ventana 7d
  prisma.category.findMany.mockResolvedValue([{ id: 'catEnv' }]); // categoría "Envios"
});

describe('GET /:driverId/orders — desglose de envíos por variante', () => {
  test('agrupa por la línea "Variantes: …", cuadra el total y oculta items', async () => {
    prisma.order.findMany.mockResolvedValue([
      order('538', 420, [food('Boneless', 105), ship(40, 'Variantes: Lluvia')]),
      order('539', 595, [food('Burrito', 135), ship(60, 'Complementos: Aderezo\nVariantes: local, Lluvia')]),
      order('527', 260, [food('KFC', 85), ship(30, 'Lluvia\nVariantes: zona extendida')]),
      order('570', 205, [food('Atómica', 185), ship(20, null)]), // envío sin variante
      order('547', 250, [food('Alitas', 220)]), // sin renglón de envío
    ]);

    const res = await request(makeApp()).get('/api/driver-cash/d1/orders').expect(200);
    const { shippingTotal, shippingByVariant } = res.body.summary;

    // 40 + 60 + 30 + 20 = 150
    expect(shippingTotal).toBe(150);

    const byLabel = Object.fromEntries(shippingByVariant.map((v) => [v.variant, v]));
    expect(byLabel['Lluvia']).toEqual({ variant: 'Lluvia', count: 1, amount: 40 });
    expect(byLabel['local, Lluvia']).toEqual({ variant: 'local, Lluvia', count: 1, amount: 60 });
    // Caso tramposo: el texto libre "Lluvia" no debe ganar; la variante es la línea "Variantes:".
    expect(byLabel['zona extendida']).toEqual({ variant: 'zona extendida', count: 1, amount: 30 });
    expect(byLabel['Lluvia'].amount).not.toBe(70); // no cuenta el 30 del renglón "zona extendida"
    expect(byLabel['(sin variante)']).toEqual({ variant: '(sin variante)', count: 1, amount: 20 });

    // Ordenado por monto desc.
    expect(shippingByVariant[0].variant).toBe('local, Lluvia');

    // El cliente recibe los pedidos SIN el array items (solo se usa server-side).
    expect(res.body.orders).toHaveLength(5);
    expect(res.body.orders[0].items).toBeUndefined();
    expect(res.body.orders[0].customer).toBe('Cliente 538');
  });

  test('sin categoría de envíos configurada, el desglose queda vacío y no rompe', async () => {
    prisma.category.findMany.mockResolvedValue([]); // ninguna categoría tipo envío
    prisma.order.findMany.mockResolvedValue([
      order('538', 420, [food('Boneless', 105), ship(40, 'Variantes: Lluvia')]),
    ]);

    const res = await request(makeApp()).get('/api/driver-cash/d1/orders').expect(200);
    expect(res.body.summary.shippingTotal).toBe(0);
    expect(res.body.summary.shippingByVariant).toEqual([]);
  });
});
