'use strict';

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    tenant: { findUnique: jest.fn(), update: jest.fn() },
    location: { findFirst: jest.fn() },
    employee: { findMany: jest.fn(), create: jest.fn() },
    restaurant: { update: jest.fn() },
    category: { upsert: jest.fn() },
    menuItem: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'u1', tenantId: 'tenant-1', restaurantId: 'restaurant-1', role: 'ADMIN' };
    next();
  },
  requireTenantAccess: (_req, _res, next) => next(),
}));

jest.mock('../src/services/ai.service', () => ({ scanMenuFromImages: jest.fn() }));
jest.mock('../src/services/cloudinary.service', () => ({ uploadImage: jest.fn() }));
jest.mock('../src/services/extractColor.service', () => ({ extractAccentColor: jest.fn() }));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const tenantRoutes = require('../src/routes/tenant.routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/tenant', tenantRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('tenant routes', () => {
  test('GET /api/tenant/me exposes module flags used by admin gates', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1',
      name: 'Master Burger',
      slug: 'master-burger-s',
      ownerEmail: 'owner@example.com',
      logoUrl: null,
      primaryColor: '#7c3aed',
      hasInventory: true,
      hasDelivery: true,
      hasWebStore: false,
      whatsappNumber: '+5217293356220',
      themeConfig: { mode: 'dark' },
      onboardingStep: 3,
      onboardingDone: true,
      businessType: 'RESTAURANT',
      isOnboarded: true,
      emailVerifiedAt: null,
      restaurants: [{ id: 'restaurant-1', slug: 'master-burger-s', name: 'Master Burger', logoUrl: null }],
      subscription: {
        status: 'ACTIVE',
        trialEndsAt: null,
        currentPeriodEnd: new Date('2026-06-01T00:00:00.000Z'),
        plan: { displayName: 'Premium', name: 'PREMIUM' },
      },
    });

    const res = await request(makeApp()).get('/api/tenant/me').expect(200);

    expect(res.body).toEqual(expect.objectContaining({
      id: 'tenant-1',
      hasInventory: true,
      hasDelivery: true,
      hasWebStore: false,
      whatsappNumber: '+5217293356220',
      themeConfig: { mode: 'dark' },
    }));
  });
});
