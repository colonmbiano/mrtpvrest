'use strict';

// Tests del motor conversacional del chatbot de WhatsApp. El motor es PURO
// respecto a la BD (toda lectura/escritura entra por `deps`), así que aquí lo
// ejercitamos con fakes deterministas — sin Prisma ni red.

const { handleInbound, STATES, addToCart, cartSubtotal, capableLocations } =
  require('../src/services/whatsapp-bot/engine');

const restaurant = { id: 'r1', name: 'Taquería Demo' };

const FAKE_MENU = [
  {
    id: 'cat1',
    name: 'Hamburguesas',
    lines: [
      { menuItemId: 'mi1', variantId: null, name: 'Clásica', unitPrice: 100 },
      { menuItemId: 'mi2', variantId: 'v1', name: 'Doble (Grande)', unitPrice: 150 },
    ],
  },
  {
    id: 'cat2',
    name: 'Bebidas',
    lines: [{ menuItemId: 'mi3', variantId: null, name: 'Refresco', unitPrice: 30 }],
  },
];

function makeDeps(overrides = {}) {
  const createOrder = jest.fn(async (data) => ({
    order: {
      id: 'ord1',
      orderNumber: 'WA-123456',
      total: cartSubtotal(data.cart) + (data.orderType === 'DELIVERY' ? 25 : 0),
      orderType: data.orderType,
    },
    estimatedMinutes: 40,
  }));
  const createCheckout = jest.fn(async () => 'https://pago.example/checkout/abc');
  return {
    loadMenu: overrides.loadMenu || (async () => FAKE_MENU),
    createOrder: overrides.createOrder || createOrder,
    createCheckout: overrides.createCheckout || createCheckout,
    _createOrder: createOrder,
    _createCheckout: createCheckout,
  };
}

const FLAT_CONFIG = { minOrderAmount: 0, deliveryMode: 'FLAT', deliveryFee: 25, estimatedDelivery: 40, isOpen: true };

// Helper: ejecuta un turno y devuelve el outcome. Threadea state/data.
function turn(prev, input, deps, config = FLAT_CONFIG, locations = [], onlinePayment = false) {
  const message =
    typeof input === 'object'
      ? { from: '5215511112222', ...input }
      : { type: 'text', text: input, from: '5215511112222' };
  const session = prev ? { state: prev.state, data: prev.data } : null;
  return handleInbound({ restaurant, config, locations, session, message, deps, onlinePayment });
}

describe('engine :: helpers', () => {
  test('addToCart agrega y fusiona líneas idénticas', () => {
    const cart = [];
    addToCart(cart, { menuItemId: 'a', variantId: null, name: 'A', unitPrice: 10 }, 2);
    addToCart(cart, { menuItemId: 'a', variantId: null, name: 'A', unitPrice: 10 }, 3);
    addToCart(cart, { menuItemId: 'a', variantId: 'v', name: 'A v', unitPrice: 12 }, 1);
    expect(cart).toHaveLength(2);
    expect(cart[0].quantity).toBe(5);
  });

  test('cartSubtotal suma precio * cantidad', () => {
    expect(cartSubtotal([{ unitPrice: 10, quantity: 2 }, { unitPrice: 5, quantity: 3 }])).toBe(35);
  });

  test('capableLocations filtra por capacidad con fallback a todas', () => {
    const locs = [
      { id: 'a', hasDelivery: true, hasTakeaway: false },
      { id: 'b', hasDelivery: false, hasTakeaway: true },
    ];
    expect(capableLocations(locs, 'DELIVERY').map((l) => l.id)).toEqual(['a']);
    expect(capableLocations(locs, 'TAKEOUT').map((l) => l.id)).toEqual(['b']);
    // Si ninguna sirve, devuelve todas (no bloquea).
    expect(capableLocations([{ id: 'x', hasDelivery: false }], 'DELIVERY')).toHaveLength(1);
  });
});

describe('engine :: flujo feliz DELIVERY (FLAT)', () => {
  test('saludo → tipo → categoría → item → cantidad → finalizar → datos → confirmar', async () => {
    const deps = makeDeps();

    let o = await turn(null, 'hola', deps);
    expect(o.state).toBe(STATES.ORDER_TYPE);
    expect(o.replies[0]).toMatch(/Bienvenid/i);

    o = await turn(o, '1', deps); // delivery
    expect(o.state).toBe(STATES.CATEGORY);
    expect(o.data.orderType).toBe('DELIVERY');
    expect(o.replies[0]).toMatch(/Hamburguesas/);

    o = await turn(o, '1', deps); // categoría Hamburguesas
    expect(o.state).toBe(STATES.ITEM);
    expect(o.replies[0]).toMatch(/Clásica/);

    o = await turn(o, '1', deps); // item Clásica
    expect(o.state).toBe(STATES.QUANTITY);

    o = await turn(o, '2', deps); // cantidad 2
    expect(o.state).toBe(STATES.CATEGORY);
    expect(o.data.cart).toHaveLength(1);
    expect(o.data.cart[0].quantity).toBe(2);
    expect(o.replies[0]).toMatch(/Agregué/);

    o = await turn(o, 'finalizar', deps);
    expect(o.state).toBe(STATES.NAME);

    o = await turn(o, 'Juan Pérez', deps);
    expect(o.state).toBe(STATES.ADDRESS);
    expect(o.data.customerName).toBe('Juan Pérez');

    o = await turn(o, 'Av. Siempre Viva 123', deps);
    expect(o.state).toBe(STATES.PAYMENT); // FLAT → no pide pin

    o = await turn(o, '1', deps); // efectivo
    expect(o.state).toBe(STATES.CONFIRM);
    expect(o.replies[0]).toMatch(/Total/);

    o = await turn(o, 'si', deps);
    expect(deps._createOrder).toHaveBeenCalledTimes(1);
    const passed = deps._createOrder.mock.calls[0][0];
    expect(passed.orderType).toBe('DELIVERY');
    expect(passed.deliveryAddress).toBe('Av. Siempre Viva 123');
    expect(passed.paymentMethod).toBe('CASH');
    expect(o.replies[0]).toMatch(/Pedido recibido/);
    expect(o.state).toBe(STATES.GREETING);
    expect(o.data.cart).toHaveLength(0); // sesión reiniciada
    expect(o.data.lastOrderId).toBe('ord1');
  });
});

describe('engine :: flujo PICKUP omite dirección', () => {
  test('takeout va directo a pago tras el nombre', async () => {
    const deps = makeDeps();
    let o = await turn(null, 'hola', deps);
    o = await turn(o, '2', deps); // pickup
    expect(o.data.orderType).toBe('TAKEOUT');
    o = await turn(o, '2', deps); // categoría Bebidas
    o = await turn(o, '1', deps); // Refresco
    o = await turn(o, '1', deps); // cantidad 1
    o = await turn(o, 'finalizar', deps);
    expect(o.state).toBe(STATES.NAME);
    o = await turn(o, 'Ana', deps);
    expect(o.state).toBe(STATES.PAYMENT); // sin dirección
    o = await turn(o, '2', deps); // transferencia
    expect(o.state).toBe(STATES.CONFIRM);
    o = await turn(o, 'sí', deps);
    const passed = deps._createOrder.mock.calls[0][0];
    expect(passed.orderType).toBe('TAKEOUT');
    expect(passed.paymentMethod).toBe('TRANSFER');
    expect(passed.deliveryAddress).toBeNull();
  });
});

describe('engine :: envío por distancia', () => {
  const DIST_CONFIG = {
    minOrderAmount: 0,
    deliveryMode: 'DISTANCE',
    originLat: 19.4,
    originLng: -99.1,
    deliveryBaseFee: 20,
    deliveryPerKm: 5,
    deliveryMaxKm: 5,
    estimatedDelivery: 40,
    isOpen: true,
  };

  async function reachLocationPin(deps) {
    let o = await turn(null, 'hola', deps, DIST_CONFIG);
    o = await turn(o, '1', deps, DIST_CONFIG); // delivery
    o = await turn(o, '1', deps, DIST_CONFIG); // Hamburguesas
    o = await turn(o, '1', deps, DIST_CONFIG); // Clásica
    o = await turn(o, '1', deps, DIST_CONFIG); // cantidad
    o = await turn(o, 'finalizar', deps, DIST_CONFIG);
    o = await turn(o, 'Juan', deps, DIST_CONFIG);
    o = await turn(o, 'Calle 1', deps, DIST_CONFIG);
    return o;
  }

  test('pide pin de ubicación en modo DISTANCE', async () => {
    const deps = makeDeps();
    const o = await reachLocationPin(deps);
    expect(o.state).toBe(STATES.LOCATION_PIN);
    expect(o.replies[0]).toMatch(/ubicaci/i);
  });

  test('ubicación dentro de cobertura avanza a pago', async () => {
    const deps = makeDeps();
    let o = await reachLocationPin(deps);
    o = await turn(o, { type: 'location', location: { lat: 19.41, lng: -99.11 } }, deps, DIST_CONFIG);
    expect(o.state).toBe(STATES.PAYMENT);
    expect(o.data.deliveryLat).toBeCloseTo(19.41);
  });

  test('ubicación fuera de cobertura regresa a dirección', async () => {
    const deps = makeDeps();
    let o = await reachLocationPin(deps);
    o = await turn(o, { type: 'location', location: { lat: 20.5, lng: -99.9 } }, deps, DIST_CONFIG);
    expect(o.state).toBe(STATES.ADDRESS);
    expect(o.replies.join(' ')).toMatch(/cobertura/i);
  });

  test('omitir el pin usa la tarifa base y avanza a pago', async () => {
    const deps = makeDeps();
    let o = await reachLocationPin(deps);
    o = await turn(o, 'omitir', deps, DIST_CONFIG);
    expect(o.state).toBe(STATES.PAYMENT);
    expect(o.data.deliveryLat).toBeNull();
  });
});

describe('engine :: comandos globales y validaciones', () => {
  test('cancelar reinicia desde cualquier punto', async () => {
    const deps = makeDeps();
    let o = await turn(null, 'hola', deps);
    o = await turn(o, '1', deps);
    o = await turn(o, 'cancelar', deps);
    expect(o.state).toBe(STATES.GREETING);
    expect(o.replies[0]).toMatch(/cancelad/i);
  });

  test('tipo de pedido inválido reprompta', async () => {
    const deps = makeDeps();
    let o = await turn(null, 'hola', deps);
    o = await turn(o, 'no sé', deps);
    expect(o.state).toBe(STATES.ORDER_TYPE);
  });

  test('mínimo de compra bloquea el cierre', async () => {
    const deps = makeDeps();
    const cfg = { ...FLAT_CONFIG, minOrderAmount: 500 };
    let o = await turn(null, 'hola', deps, cfg);
    o = await turn(o, '1', deps, cfg);
    o = await turn(o, '1', deps, cfg); // Hamburguesas
    o = await turn(o, '1', deps, cfg); // Clásica ($100)
    o = await turn(o, '1', deps, cfg); // cantidad 1 → $100
    o = await turn(o, 'finalizar', deps, cfg);
    expect(o.state).toBe(STATES.CATEGORY);
    expect(o.replies[0]).toMatch(/mínimo/i);
  });

  test('mensajes no soportados (imagen) repromptan sin avanzar', async () => {
    const deps = makeDeps();
    let o = await turn(null, 'hola', deps);
    o = await turn(o, '1', deps); // CATEGORY
    const before = o.state;
    o = await turn(o, { type: 'other' }, deps);
    expect(o.state).toBe(before);
  });

  test('menú vacío reinicia con aviso', async () => {
    const deps = makeDeps({ loadMenu: async () => [] });
    let o = await turn(null, 'hola', deps);
    o = await turn(o, '1', deps);
    expect(o.state).toBe(STATES.GREETING);
    expect(o.replies[0]).toMatch(/no hay productos/i);
  });
});

describe('engine :: pago en línea', () => {
  // Llega hasta PAYMENT en un pedido pickup con pago en línea habilitado.
  async function reachPayment(deps, online) {
    let o = await turn(null, 'hola', deps, FLAT_CONFIG, [], online);
    o = await turn(o, '2', deps, FLAT_CONFIG, [], online); // pickup
    o = await turn(o, '1', deps, FLAT_CONFIG, [], online); // Hamburguesas
    o = await turn(o, '1', deps, FLAT_CONFIG, [], online); // Clásica
    o = await turn(o, '1', deps, FLAT_CONFIG, [], online); // cantidad
    o = await turn(o, 'finalizar', deps, FLAT_CONFIG, [], online);
    o = await turn(o, 'Ana', deps, FLAT_CONFIG, [], online);
    return o;
  }

  test('ofrece la opción 3 y genera el link tras confirmar', async () => {
    const deps = makeDeps();
    let o = await reachPayment(deps, true);
    expect(o.state).toBe(STATES.PAYMENT);
    expect(o.replies[0]).toMatch(/Pago en línea/i);

    o = await turn(o, '3', deps, FLAT_CONFIG, [], true);
    expect(o.state).toBe(STATES.CONFIRM);
    expect(o.replies[0]).toMatch(/Pago en línea/i);

    o = await turn(o, 'si', deps, FLAT_CONFIG, [], true);
    expect(deps._createOrder).toHaveBeenCalledTimes(1);
    expect(deps._createCheckout).toHaveBeenCalledTimes(1);
    expect(deps._createOrder.mock.calls[0][0].paymentMethod).toBe('ONLINE');
    expect(o.replies.join(' ')).toMatch(/pago\.example/);
  });

  test('si falla la generación del link, avisa con fallback', async () => {
    const deps = makeDeps({ createCheckout: jest.fn(async () => null) });
    let o = await reachPayment(deps, true);
    o = await turn(o, '3', deps, FLAT_CONFIG, [], true);
    o = await turn(o, 'si', deps, FLAT_CONFIG, [], true);
    expect(o.replies.join(' ')).toMatch(/efectivo al recibir/i);
  });

  test('sin pago en línea, la opción 3 no se ofrece ni se acepta', async () => {
    const deps = makeDeps();
    let o = await reachPayment(deps, false);
    expect(o.replies[0]).not.toMatch(/Pago en línea/i);
    o = await turn(o, '3', deps, FLAT_CONFIG, [], false);
    expect(o.state).toBe(STATES.PAYMENT); // opción inválida → reprompt
  });
});
