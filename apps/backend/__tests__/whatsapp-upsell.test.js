'use strict';

// Tests del upsell del chatbot:
//  - upsell.pickOffer: aplicabilidad (disparador, mínimo, ya-en-carrito,
//    producto vivo en el menú) y conteo de ofertas.
//  - Flujo en el motor: al "finalizar" se ofrece una vez; SÍ agrega y registra,
//    NO continúa al checkout sin agregar.

const { handleInbound, STATES } = require('../src/services/whatsapp-bot/engine');
const upsell = require('../src/services/whatsapp-bot/upsell');

const restaurant = { id: 'r1', name: 'Taquería Demo' };

const FAKE_MENU = [
  {
    id: 'cat1',
    name: 'Hamburguesas',
    lines: [{ menuItemId: 'mi1', variantId: null, name: 'Clásica', unitPrice: 100 }],
  },
  {
    id: 'cat2',
    name: 'Bebidas',
    lines: [{ menuItemId: 'mi3', variantId: null, name: 'Refresco', unitPrice: 30 }],
  },
];

const FLAT_CONFIG = { minOrderAmount: 0, deliveryMode: 'FLAT', deliveryFee: 25, estimatedDelivery: 40, isOpen: true };

function turn(prev, input, deps) {
  const message = { type: 'text', text: input, from: '5215511112222' };
  const session = prev ? { state: prev.state, data: prev.data } : null;
  return handleInbound({ restaurant, config: FLAT_CONFIG, locations: [], session, message, deps, onlinePayment: false });
}

// Estado listo para "finalizar": carrito con la hamburguesa.
function cartState() {
  return {
    state: STATES.CART,
    data: {
      phone: '5215511112222',
      orderType: 'TAKEOUT',
      locationId: null,
      cart: [{ menuItemId: 'mi1', variantId: null, name: 'Clásica', unitPrice: 100, quantity: 1 }],
      customerName: null,
      deliveryAddress: null,
      deliveryLat: null,
      deliveryLng: null,
      paymentMethod: null,
      nav: { categoryId: null },
      pending: null,
      upsellOffered: false,
      pendingUpsell: null,
      lastOrderId: null,
    },
  };
}

const OFFER = { ruleId: 'up1', menuItemId: 'mi3', variantId: null, name: 'Refresco', unitPrice: 30, offerText: null };

describe('engine :: flujo de upsell', () => {
  test('al finalizar ofrece la sugerencia y pasa a UPSELL', async () => {
    const loadUpsellOffer = jest.fn(async () => ({ ...OFFER }));
    const deps = { loadMenu: async () => FAKE_MENU, loadUpsellOffer };

    const out = await turn(cartState(), 'finalizar', deps);

    expect(out.state).toBe(STATES.UPSELL);
    expect(out.replies.join('\n')).toContain('Refresco');
    expect(out.data.upsellOffered).toBe(true);
    expect(out.data.pendingUpsell.ruleId).toBe('up1');
  });

  test('SÍ agrega el producto, registra la aceptación y pide el nombre', async () => {
    const recordUpsellAccept = jest.fn(async () => {});
    const deps = { loadMenu: async () => FAKE_MENU, loadUpsellOffer: async () => ({ ...OFFER }), recordUpsellAccept };

    const offered = await turn(cartState(), 'finalizar', deps);
    const out = await turn(offered, 'sí', deps);

    expect(out.state).toBe(STATES.NAME);
    expect(out.data.cart.some((i) => i.menuItemId === 'mi3')).toBe(true);
    expect(recordUpsellAccept).toHaveBeenCalledWith('up1', 30);
  });

  test('NO continúa al checkout sin agregar y sin registrar', async () => {
    const recordUpsellAccept = jest.fn(async () => {});
    const deps = { loadMenu: async () => FAKE_MENU, loadUpsellOffer: async () => ({ ...OFFER }), recordUpsellAccept };

    const offered = await turn(cartState(), 'finalizar', deps);
    const out = await turn(offered, 'no', deps);

    expect(out.state).toBe(STATES.NAME);
    expect(out.data.cart.some((i) => i.menuItemId === 'mi3')).toBe(false);
    expect(recordUpsellAccept).not.toHaveBeenCalled();
  });

  test('solo se ofrece una vez por conversación', async () => {
    const loadUpsellOffer = jest.fn(async () => ({ ...OFFER }));
    const deps = { loadMenu: async () => FAKE_MENU, loadUpsellOffer };

    const offered = await turn(cartState(), 'finalizar', deps);
    const declined = await turn(offered, 'no', deps);
    // Regresa al menú y vuelve a finalizar: ya no debe re-ofrecer.
    const backToMenu = await turn(declined, 'menú', deps);
    const out = await turn(backToMenu, 'finalizar', deps);

    expect(loadUpsellOffer).toHaveBeenCalledTimes(1);
    expect(out.state).toBe(STATES.NAME);
  });

  test('sin oferta aplicable va directo al nombre', async () => {
    const deps = { loadMenu: async () => FAKE_MENU, loadUpsellOffer: async () => null };
    const out = await turn(cartState(), 'finalizar', deps);
    expect(out.state).toBe(STATES.NAME);
  });
});

describe('upsell.pickOffer :: aplicabilidad', () => {
  const CART = [{ menuItemId: 'mi1', variantId: null, name: 'Clásica', unitPrice: 100, quantity: 1 }];

  function fakePrisma(rules) {
    return {
      upsellRule: {
        findMany: jest.fn(async () => rules),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
  }

  const baseRule = {
    id: 'up1',
    name: 'Refresco con todo',
    enabled: true,
    menuItemId: 'mi3',
    variantId: null,
    triggerType: 'ALWAYS',
    triggerId: null,
    minSubtotal: 0,
    offerText: null,
    offerCount: 0,
  };

  test('regla ALWAYS aplicable: devuelve la oferta con precio del menú y cuenta la oferta', async () => {
    const prisma = fakePrisma([{ ...baseRule }]);
    const offer = await upsell.pickOffer({ prisma, restaurantId: 'r1', cart: CART, loadMenu: async () => FAKE_MENU });

    expect(offer).toMatchObject({ ruleId: 'up1', name: 'Refresco', unitPrice: 30 });
    expect(prisma.upsellRule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'up1', restaurantId: 'r1' } })
    );
  });

  test('respeta el disparador por categoría', async () => {
    const match = { ...baseRule, triggerType: 'CATEGORY', triggerId: 'cat1' };
    const noMatch = { ...baseRule, id: 'up2', triggerType: 'CATEGORY', triggerId: 'cat2' };

    expect(await upsell.pickOffer({ prisma: fakePrisma([match]), restaurantId: 'r1', cart: CART, loadMenu: async () => FAKE_MENU })).not.toBeNull();
    expect(await upsell.pickOffer({ prisma: fakePrisma([noMatch]), restaurantId: 'r1', cart: CART, loadMenu: async () => FAKE_MENU })).toBeNull();
  });

  test('respeta el mínimo de subtotal', async () => {
    const rule = { ...baseRule, minSubtotal: 500 };
    expect(await upsell.pickOffer({ prisma: fakePrisma([rule]), restaurantId: 'r1', cart: CART, loadMenu: async () => FAKE_MENU })).toBeNull();
  });

  test('no sugiere algo que ya está en el carrito', async () => {
    const cart = [...CART, { menuItemId: 'mi3', variantId: null, name: 'Refresco', unitPrice: 30, quantity: 1 }];
    expect(await upsell.pickOffer({ prisma: fakePrisma([{ ...baseRule }]), restaurantId: 'r1', cart, loadMenu: async () => FAKE_MENU })).toBeNull();
  });

  test('no ofrece productos que ya no están en el menú', async () => {
    const rule = { ...baseRule, menuItemId: 'fantasma' };
    expect(await upsell.pickOffer({ prisma: fakePrisma([rule]), restaurantId: 'r1', cart: CART, loadMenu: async () => FAKE_MENU })).toBeNull();
  });
});
