'use strict';

// El motor y la creación real del pedido trabajan juntos; solo se simulan BD,
// folios y CRM. No se envían mensajes ni se generan pedidos operativos.
jest.mock('../src/lib/payment-providers', () => ({ resolveProviderForRestaurant: jest.fn() }));
jest.mock('../src/lib/order-number', () => ({ nextOrderNumber: jest.fn().mockResolvedValue('42') }));
jest.mock('../src/services/whatsapp-bot/contacts', () => ({ upsertContact: jest.fn().mockResolvedValue(null) }));

const { handleInbound, STATES, freshData } = require('../src/services/whatsapp-bot/engine');
const { quoteBotOrder, createBotOrder } = require('../src/services/whatsapp-bot/order');
const { nextOrderNumber } = require('../src/lib/order-number');

function fixture() {
  const restaurant = { id: 'r1', name: 'Demo' };
  const config = { deliveryMode: 'FLAT', deliveryFee: 25, minOrderAmount: 0 };
  const products = [
    { id: 'a', name: 'Clásica', price: 100, variants: [] },
    { id: 'b', name: 'Bebida', price: 30, variants: [{ id: 'v1', name: 'Grande', price: 40 }] },
  ];
  const prisma = {
    menuItem: { findFirst: jest.fn(async ({ where }) => products.find((p) => p.id === where.id) || null) },
    order: { create: jest.fn(async ({ data }) => ({ ...data, id: 'order-42', items: data.items.create })) },
  };
  const args = { prisma, restaurant, config, io: null };
  const deps = {
    loadMenu: jest.fn(async () => []),
    quoteOrder: (data) => quoteBotOrder({ ...args, data }),
    createOrder: (data) => createBotOrder({ ...args, data }),
  };
  const data = {
    ...freshData('5215511112222'),
    orderType: 'DELIVERY', customerName: 'Ana', deliveryAddress: 'Calle 1',
    cart: [{ menuItemId: 'a', variantId: null, name: 'Clásica', unitPrice: 100, quantity: 2 }],
  };
  const turn = (session, text) => handleInbound({
    restaurant, config, session, deps,
    message: { type: 'text', text, from: data.phone },
  });
  return { ...args, products, deps, data, turn };
}

beforeEach(() => jest.clearAllMocks());

describe('checkout WhatsApp :: consentimiento', () => {
  test.each(['no confirmo', 'no confirmar', 'sin confirmar', '¿puedes confirmar?', 'confirmar luego', 'desconfirmar', 'no, gracias', ''])('%j no envía el pedido', async (text) => {
    const f = fixture();
    const summary = await f.turn({ state: STATES.PAYMENT, data: f.data }, '1');
    const out = await f.turn(summary, text);
    expect(out.state).toBe(STATES.CONFIRM);
    expect(out.replies.join(' ')).toMatch(/CONFIRMAR/);
    expect(f.prisma.order.create).not.toHaveBeenCalled();
    expect(nextOrderNumber).not.toHaveBeenCalled();
  });

  test.each(['CONFIRMAR', 'confirmo', 'sí', '1'])('acepta %j después del resumen y no duplica en el turno siguiente', async (text) => {
    const f = fixture();
    const summary = await f.turn({ state: STATES.PAYMENT, data: f.data }, '1');
    expect(f.prisma.order.create).not.toHaveBeenCalled();
    const sent = await f.turn(summary, text);
    expect(sent.data.lastOrderId).toBe('order-42');
    expect(f.prisma.order.create).toHaveBeenCalledTimes(1);
    await f.turn(sent, 'CONFIRMAR');
    expect(f.prisma.order.create).toHaveBeenCalledTimes(1);
  });

  test('cancelar después del resumen no crea pedido', async () => {
    const f = fixture();
    const summary = await f.turn({ state: STATES.PAYMENT, data: f.data }, '1');
    const out = await f.turn(summary, 'NO');
    expect(out.state).toBe(STATES.GREETING);
    expect(f.prisma.order.create).not.toHaveBeenCalled();
  });

  test('una sesión antigua sin cotización recibe el resumen antes de crear', async () => {
    const f = fixture();
    const out = await f.turn({ state: STATES.CONFIRM, data: f.data }, 'CONFIRMAR');
    expect(out.state).toBe(STATES.CONFIRM);
    expect(out.data.confirmedQuote.total).toBe(225);
    expect(f.prisma.order.create).not.toHaveBeenCalled();
  });
});

describe('checkout WhatsApp :: precios y disponibilidad', () => {
  test('el resumen usa precios del tenant y el mismo total que se guarda', async () => {
    const f = fixture();
    f.data.cart[0].unitPrice = 1; // precio viejo o salida manipulada del modelo
    const summary = await f.turn({ state: STATES.PAYMENT, data: f.data }, '1');
    expect(summary.data.confirmedQuote.total).toBe(225);
    expect(summary.replies.join(' ')).toContain('$225.00');
    await f.turn(summary, 'CONFIRMAR');
    expect(f.prisma.order.create.mock.calls[0][0].data.total).toBe(225);
    expect(f.prisma.menuItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'a', restaurantId: 'r1', isAvailable: true },
    }));
  });

  test.each(['precio', 'envío'])('si cambia %s, requiere otra confirmación con el total nuevo', async (field) => {
    const f = fixture();
    const summary = await f.turn({ state: STATES.PAYMENT, data: f.data }, '1');
    if (field === 'precio') f.products[0].price = 120;
    else f.config.deliveryFee = 40;
    const revised = await f.turn(summary, 'CONFIRMAR');
    const expected = field === 'precio' ? 265 : 240;
    expect(revised.state).toBe(STATES.CONFIRM);
    expect(revised.replies.join(' ')).toContain(`$${expected}.00`);
    expect(f.prisma.order.create).not.toHaveBeenCalled();
    await f.turn(revised, 'CONFIRMAR');
    expect(f.prisma.order.create).toHaveBeenCalledTimes(1);
    expect(f.prisma.order.create.mock.calls[0][0].data.total).toBe(expected);
  });

  test('no guarda un pedido parcial cuando desaparece un producto', async () => {
    const f = fixture();
    f.data.cart.push({ menuItemId: 'b', variantId: 'v1', name: 'Bebida (Grande)', unitPrice: 40, quantity: 1 });
    const summary = await f.turn({ state: STATES.PAYMENT, data: f.data }, '1');
    f.products.splice(1, 1);
    const out = await f.turn(summary, 'CONFIRMAR');
    expect(out.state).toBe(STATES.CART);
    expect(out.data.cart).toHaveLength(2);
    expect(out.replies.join(' ')).toMatch(/Bebida.*ya no está disponible/);
    expect(out.replies.join(' ')).toContain('2.');
    expect(f.prisma.order.create).not.toHaveBeenCalled();
    expect(nextOrderNumber).not.toHaveBeenCalled();
    const fixed = await f.turn(out, 'quitar 2');
    expect(fixed.data.cart).toHaveLength(1);
  });

  test('una variante retirada bloquea el pedido entero', async () => {
    const f = fixture();
    f.data.cart.push({ menuItemId: 'b', variantId: 'retirada', quantity: 1 });
    await expect(f.deps.quoteOrder(f.data)).rejects.toMatchObject({ code: 'ITEM_UNAVAILABLE' });
    expect(f.prisma.order.create).not.toHaveBeenCalled();
  });

  test('no sustituye una variante omitida por el precio base', async () => {
    const f = fixture();
    f.data.cart = [{ menuItemId: 'b', variantId: null, quantity: 1 }];
    await expect(f.deps.quoteOrder(f.data)).rejects.toMatchObject({ code: 'ITEM_UNAVAILABLE' });
  });

  test('promoción vencida entre resumen y confirmación vuelve al carrito', async () => {
    const f = fixture();
    const summary = await f.turn({ state: STATES.PAYMENT, data: f.data }, '1');
    Object.assign(f.products[0], { isPromo: true, promoStartTime: '10:00', promoEndTime: '11:00' });
    jest.useFakeTimers().setSystemTime(new Date('2026-11-01T18:00:00Z')); // mediodía CDMX
    try {
      const out = await f.turn(summary, 'CONFIRMAR');
      expect(out.state).toBe(STATES.CART);
      expect(f.prisma.order.create).not.toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });

  test('no reduce silenciosamente cantidades acumuladas mayores a 50', async () => {
    const f = fixture();
    f.data.cart[0].quantity = 75;
    const summary = await f.turn({ state: STATES.PAYMENT, data: f.data }, '1');
    await f.turn(summary, 'CONFIRMAR');
    const order = f.prisma.order.create.mock.calls[0][0].data;
    expect(order.items.create[0].quantity).toBe(75);
    expect(order.total).toBe(7525);
  });

  test.each([0, -1, 1.5, 100, 'dos'])('cantidad inválida %j no llega a la BD', async (quantity) => {
    const f = fixture();
    f.data.cart[0].quantity = quantity;
    const out = await f.turn({ state: STATES.PAYMENT, data: f.data }, '1');
    expect(out.state).toBe(STATES.CART);
    expect(f.prisma.order.create).not.toHaveBeenCalled();
  });

  test('un fallo de BD no se anuncia como pedido recibido', async () => {
    const f = fixture();
    const summary = await f.turn({ state: STATES.PAYMENT, data: f.data }, '1');
    f.prisma.order.create.mockRejectedValueOnce(new Error('DB no disponible'));
    await expect(f.turn(summary, 'CONFIRMAR')).rejects.toThrow('DB no disponible');
  });
});
