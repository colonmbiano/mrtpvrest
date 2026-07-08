'use strict';

// Tests de los widgets nuevos del dashboard:
//  - /peak-heatmap: agrupa pedidos por (día × hora) EN HORA DE MÉXICO
//    (el servidor corre en UTC; getHours() crudo desfasaría 6 horas).
//  - /agent-health: consolida conexión WhatsApp + conversaciones + pedidos
//    del bot + upsell en un solo payload.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    order: { findMany: jest.fn(), aggregate: jest.fn() },
    integrationConfig: { findFirst: jest.fn() },
    whatsappConversation: { groupBy: jest.fn(), aggregate: jest.fn() },
    whatsappMessage: { count: jest.fn() },
    upsellRule: { aggregate: jest.fn() },
  },
}));

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'u1', restaurantId: 'r1', role: 'ADMIN' };
    next();
  },
  requireTenantAccess: (_req, _res, next) => next(),
  requireAdmin: (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const dashboardRoutes = require('../src/routes/dashboard.routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/dashboard', dashboardRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/dashboard/peak-heatmap', () => {
  test('coloca cada pedido en el día/hora de México (UTC-6), no de UTC', async () => {
    // 02:00Z del miércoles = 20:00 del MARTES en CDMX.
    prisma.order.findMany.mockResolvedValue([
      { createdAt: new Date('2026-07-08T02:00:00Z') }, // martes 20h MX
      { createdAt: new Date('2026-07-08T02:30:00Z') }, // martes 20h MX
      { createdAt: new Date('2026-07-08T18:00:00Z') }, // miércoles 12h MX
    ]);

    const res = await request(makeApp()).get('/api/dashboard/peak-heatmap');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.max).toBe(2);
    // grid[dia][hora]: dia 0 = lunes … martes = 1, miércoles = 2.
    expect(res.body.grid[1][20]).toBe(2);
    expect(res.body.grid[2][12]).toBe(1);
    // El desfase crudo de UTC habría caído en miércoles 2h / 18h:
    expect(res.body.grid[2][2]).toBe(0);
    expect(res.body.grid[2][18]).toBe(0);
  });
});

describe('GET /api/dashboard/agent-health', () => {
  test('consolida conexión, conversaciones, pedidos del bot y upsell', async () => {
    prisma.integrationConfig.findFirst.mockResolvedValue({
      enabled: true,
      config: JSON.stringify({ provider: 'META', token: 't' }),
    });
    prisma.whatsappConversation.groupBy.mockResolvedValue([
      { status: 'OPEN', _count: { _all: 4 } },
      { status: 'NEEDS_HUMAN', _count: { _all: 2 } },
    ]);
    prisma.whatsappConversation.aggregate.mockResolvedValue({ _sum: { unreadCount: 7 } });
    prisma.whatsappMessage.count.mockResolvedValue(31);
    prisma.order.aggregate.mockResolvedValue({ _count: { _all: 12 }, _sum: { total: 4850.5 } });
    prisma.upsellRule.aggregate.mockResolvedValue({ _sum: { acceptCount: 9, revenue: 315 } });

    const res = await request(makeApp()).get('/api/dashboard/agent-health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      connection: { configured: true, enabled: true, provider: 'META' },
      conversations: { open: 4, needsHuman: 2, resolved: 0, unread: 7, inbound24h: 31 },
      botOrders7d: { count: 12, revenue: 4850.5 },
      upsell: { accepts: 9, revenue: 315 },
    });
    // El aggregate de pedidos del bot filtra por canal WHATSAPP y excluye cancelados.
    expect(prisma.order.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ restaurantId: 'r1', source: 'WHATSAPP', status: { not: 'CANCELLED' } }),
      })
    );
  });

  test('sin integración de WhatsApp reporta "sin conectar"', async () => {
    prisma.integrationConfig.findFirst.mockResolvedValue(null);
    prisma.whatsappConversation.groupBy.mockResolvedValue([]);
    prisma.whatsappConversation.aggregate.mockResolvedValue({ _sum: { unreadCount: null } });
    prisma.whatsappMessage.count.mockResolvedValue(0);
    prisma.order.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { total: null } });
    prisma.upsellRule.aggregate.mockResolvedValue({ _sum: { acceptCount: null, revenue: null } });

    const res = await request(makeApp()).get('/api/dashboard/agent-health');

    expect(res.status).toBe(200);
    expect(res.body.connection).toEqual({ configured: false, enabled: false, provider: null });
    expect(res.body.conversations.unread).toBe(0);
  });
});
