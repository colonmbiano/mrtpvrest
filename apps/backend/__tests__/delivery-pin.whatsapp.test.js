'use strict';

// Código de entrega de pedidos propios en los WhatsApp al comprador: la
// confirmación del chatbot y el aviso "en camino". Prisma, web-push, axios y
// los helpers con BD van mockeados: sin red ni base de datos.

const ENV_KEYS = ['STORE_DELIVERY_PIN_MODE', 'STORE_DELIVERY_PIN_SECRET'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
// Los módulos crean su instancia del PIN al cargarse: el env va antes del require.
process.env.STORE_DELIVERY_PIN_MODE = 'optional';
process.env.STORE_DELIVERY_PIN_SECRET = 'w'.repeat(40);

let mockAxiosPost;

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    pushSubscription: { findMany: jest.fn().mockResolvedValue([]), delete: jest.fn() },
    integrationConfig: { findFirst: jest.fn().mockResolvedValue({ config: JSON.stringify({ provider: 'WHAPI', token: 'REST_TOKEN' }) }) },
    restaurant: { findUnique: jest.fn().mockResolvedValue({ name: 'Tacos Don Juan' }) },
    restaurantConfig: { findUnique: jest.fn().mockResolvedValue(null) },
  },
}));
jest.mock('web-push', () => ({ setVapidDetails: jest.fn(), sendNotification: jest.fn().mockResolvedValue({}) }));
jest.mock('axios', () => {
  mockAxiosPost = jest.fn().mockResolvedValue({ data: { id: 'sent' } });
  return { post: (...args) => mockAxiosPost(...args) };
});
jest.mock('../src/lib/order-number', () => ({ nextOrderNumber: jest.fn().mockResolvedValue('WA-1') }));
jest.mock('../src/lib/payment-providers', () => ({ resolveProviderForRestaurant: jest.fn() }));
jest.mock('../src/services/whatsapp-bot/contacts', () => ({ upsertContact: jest.fn().mockResolvedValue(null) }));

const webpush = require('web-push');
const { deriveStoreDeliveryPin, customerPinText } = require('../src/lib/store-delivery-pin');
const messages = require('../src/services/whatsapp-bot/messages');
const { handleInbound, STATES } = require('../src/services/whatsapp-bot/engine');
const { createBotOrder } = require('../src/services/whatsapp-bot/order');
const { notifyOrderStatus } = require('../src/services/notifications.service');

const SECRET = 'w'.repeat(40);
const pinOf = (id) => deriveStoreDeliveryPin(id, SECRET);

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

beforeEach(() => jest.clearAllMocks());

describe('texto del código', () => {
  it('solo arma el texto con un PIN de 6 dígitos', () => {
    expect(customerPinText('012345')).toContain('*Código de entrega:* 012345');
    for (const bad of [null, undefined, '', '12345', '1234567', 'abcdef', 123456]) {
      expect(customerPinText(bad)).toBe('');
    }
  });
});

describe('chatbot :: confirmación del pedido', () => {
  const base = { orderNumber: 'WA-1', total: 150, estimatedMinutes: 30 };

  it('incluye el código solo en pedidos a domicilio que lo traen', () => {
    expect(messages.orderCreated({ ...base, orderType: 'DELIVERY', deliveryPin: '654321' })).toContain('654321');
    expect(messages.orderCreated({ ...base, orderType: 'DELIVERY', deliveryPin: null })).not.toContain('Código de entrega');
    expect(messages.orderCreated({ ...base, orderType: 'TAKEOUT', deliveryPin: '654321' })).not.toContain('654321');
  });

  it('el motor pasa el código que regresa createOrder a la respuesta', async () => {
    const deps = {
      loadMenu: async () => [],
      createOrder: jest.fn(async () => ({
        order: { id: 'ord1', orderNumber: 'WA-1', total: 125, orderType: 'DELIVERY' },
        estimatedMinutes: 40,
        deliveryPin: '246810',
      })),
    };
    const session = {
      state: STATES.CONFIRM,
      data: {
        phone: '5215511112222', orderType: 'DELIVERY', customerName: 'Ana', deliveryAddress: 'Calle 1',
        paymentMethod: 'CASH', cart: [{ menuItemId: 'mi1', variantId: null, name: 'Clásica', unitPrice: 100, quantity: 1 }],
      },
    };
    const out = await handleInbound({
      restaurant: { id: 'r1', name: 'Demo' },
      config: { minOrderAmount: 0, deliveryMode: 'FLAT', deliveryFee: 25, estimatedDelivery: 40, isOpen: true },
      session,
      message: { type: 'text', text: 'si', from: '5215511112222' },
      deps,
    });
    expect(deps.createOrder).toHaveBeenCalledTimes(1);
    expect(out.replies[0]).toMatch(/Pedido recibido/);
    expect(out.replies[0]).toContain('*Código de entrega:* 246810');
  });

  it('createBotOrder regresa el código del pedido a domicilio y null al recoger', async () => {
    const prisma = {
      menuItem: { findFirst: jest.fn().mockResolvedValue({ id: 'mi1', name: 'Clásica', price: 100, variants: [] }) },
      order: { create: jest.fn(async ({ data }) => ({ id: `ord-${data.orderType}`, ...data, items: [] })) },
    };
    const args = (orderType) => ({
      prisma, io: null, restaurant: { id: 'r1' },
      config: { minOrderAmount: 0, deliveryMode: 'FLAT', deliveryFee: 25, estimatedDelivery: 30 },
      data: { orderType, phone: '5215511112222', customerName: 'Ana', deliveryAddress: 'Calle 1',
        cart: [{ menuItemId: 'mi1', variantId: null, quantity: 1 }] },
    });

    const delivery = await createBotOrder(args('DELIVERY'));
    expect(delivery.deliveryPin).toBe(pinOf('ord-DELIVERY'));
    const takeout = await createBotOrder(args('TAKEOUT'));
    expect(takeout.deliveryPin).toBeNull();
  });
});

describe('aviso "en camino" por WhatsApp', () => {
  const order = {
    id: 'o1', orderNumber: 'W-100', restaurantId: 'r1', customerPhone: '5215511112222', userId: null,
    orderType: 'DELIVERY', source: 'ONLINE', status: 'ON_THE_WAY',
  };
  const whatsappBody = () => mockAxiosPost.mock.calls[0][1].body;

  it('recuerda el código al cliente, pero no en el push', async () => {
    await notifyOrderStatus({ ...order }, 'ON_THE_WAY');
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    expect(whatsappBody()).toMatch(/va en camino/);
    expect(whatsappBody()).toContain(`*Código de entrega:* ${pinOf('o1')}`);
    for (const [, payload] of webpush.sendNotification.mock.calls) {
      expect(payload).not.toContain(pinOf('o1'));
    }
  });

  it('no lo manda en otros estados, en el marketplace ni sin datos del pedido', async () => {
    await notifyOrderStatus({ ...order, status: 'CONFIRMED' }, 'CONFIRMED');
    await notifyOrderStatus({ ...order, source: 'MARKETPLACE' }, 'ON_THE_WAY');
    await notifyOrderStatus({ ...order, orderType: 'TAKEOUT' }, 'ON_THE_WAY');
    const { orderType, source, ...partial } = order;
    await notifyOrderStatus(partial, 'ON_THE_WAY');
    expect(mockAxiosPost).toHaveBeenCalledTimes(4);
    for (const [, body] of mockAxiosPost.mock.calls) {
      expect(body.body).not.toContain('Código de entrega');
    }
  });
});
