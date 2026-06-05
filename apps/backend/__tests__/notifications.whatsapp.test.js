'use strict';

// Tests del enrutamiento de WhatsApp en las notificaciones de estado:
//  - Si el restaurante tiene integración WHATSAPP propia → se usa su token.
//  - Si no → fallback al token global de plataforma.
// Mockeamos Prisma, web-push y axios para no tocar BD ni red.

let mockAxiosPost;

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    pushSubscription: { findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
    integrationConfig: { findFirst: jest.fn() },
    restaurant: { findUnique: jest.fn() },
  },
}));

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn().mockResolvedValue({}),
}));

jest.mock('axios', () => {
  mockAxiosPost = jest.fn().mockResolvedValue({ data: { id: 'sent' } });
  return { post: (...args) => mockAxiosPost(...args) };
});

const { prisma } = require('@mrtpvrest/database');
const { notifyOrderStatus } = require('../src/services/notifications.service');

const baseOrder = {
  id: 'o1',
  orderNumber: 'WA-100',
  restaurantId: 'r1',
  customerPhone: '5215511112222',
  userId: null,
};

describe('notifyOrderStatus :: enrutamiento de WhatsApp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.pushSubscription.findMany.mockResolvedValue([]);
    prisma.restaurant.findUnique.mockResolvedValue({ name: 'Tacos Don Juan' });
  });

  it('usa el token propio del restaurante cuando hay integración habilitada', async () => {
    prisma.integrationConfig.findFirst.mockResolvedValue({
      config: JSON.stringify({ provider: 'WHAPI', token: 'REST_TOKEN' }),
    });

    await notifyOrderStatus({ ...baseOrder }, 'CONFIRMED');

    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    const [url, body, opts] = mockAxiosPost.mock.calls[0];
    expect(url).toMatch(/\/messages\/text$/);
    expect(opts.headers.Authorization).toBe('Bearer REST_TOKEN');
    expect(body.body).toContain('Tacos Don Juan'); // nombre real, no "Restaurante Demo"
    expect(body.body).toMatch(/confirmado/i);
    expect(body.to).toBe('5215511112222@s.whatsapp.net');
  });

  it('cae al token global cuando el restaurante no tiene integración', async () => {
    process.env.WHATSAPP_TOKEN = 'GLOBAL_TOKEN';
    jest.resetModules();
    // Recargar el módulo para que tome el WHATSAPP_TOKEN del env.
    let mockPost2;
    jest.doMock('@mrtpvrest/database', () => ({
      prisma: {
        pushSubscription: { findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
        integrationConfig: { findFirst: jest.fn().mockResolvedValue(null) },
        restaurant: { findUnique: jest.fn().mockResolvedValue({ name: 'Pizzería Sol' }) },
      },
    }));
    jest.doMock('web-push', () => ({ setVapidDetails: jest.fn(), sendNotification: jest.fn().mockResolvedValue({}) }));
    jest.doMock('axios', () => {
      mockPost2 = jest.fn().mockResolvedValue({ data: {} });
      return { post: (...a) => mockPost2(...a) };
    });
    const svc = require('../src/services/notifications.service');

    await svc.notifyOrderStatus({ ...baseOrder }, 'READY');

    expect(mockPost2).toHaveBeenCalledTimes(1);
    const [, , opts] = mockPost2.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer GLOBAL_TOKEN');
  });

  it('no envía WhatsApp si el pedido no tiene teléfono', async () => {
    prisma.integrationConfig.findFirst.mockResolvedValue(null);
    await notifyOrderStatus({ ...baseOrder, customerPhone: null }, 'PREPARING');
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });
});
