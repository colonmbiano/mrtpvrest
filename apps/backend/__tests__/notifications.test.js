'use strict';

let mockSendNotification;
let mockPushSubscriptions;
let mockLocation;

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    pushSubscription: { findMany: jest.fn() },
    location: { findUnique: jest.fn() },
  },
}));

jest.mock('web-push', () => {
  mockSendNotification = jest.fn().mockResolvedValue({});
  return {
    setVapidDetails: jest.fn(),
    sendNotification: (...args) => mockSendNotification(...args),
  };
});

const { prisma } = require('@mrtpvrest/database');

describe('notifyLowStock', () => {
  let notifyLowStock;

  beforeAll(() => {
    ({ notifyLowStock } = require('../src/services/notifications.service'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.RESEND_API_KEY;
  });

  it('sends push to location subscriptions when stock is low', async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([
      { id: 's1', endpoint: 'https://push.example.com/1', p256dh: 'key1', auth: 'auth1' },
    ]);

    await notifyLowStock({ id: 'i1', name: 'Tomate', unit: 'kg', stock: 0.5, minStock: 2 }, 'loc1');

    expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith({ where: { locationId: 'loc1' } });
    expect(mockSendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(mockSendNotification.mock.calls[0][1]);
    expect(payload.title).toContain('Stock bajo');
    expect(payload.body).toContain('Tomate');
  });

  it('does not throw when no subscriptions exist', async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([]);
    await expect(
      notifyLowStock({ id: 'i1', name: 'Cebolla', unit: 'kg', stock: 0, minStock: 1 }, 'loc1')
    ).resolves.not.toThrow();
  });

  it('skips email when RESEND_API_KEY is not set', async () => {
    prisma.pushSubscription.findMany.mockResolvedValue([]);
    await notifyLowStock({ id: 'i1', name: 'Sal', unit: 'g', stock: 50, minStock: 100 }, 'loc1');
    expect(prisma.location.findUnique).not.toHaveBeenCalled();
  });
});
