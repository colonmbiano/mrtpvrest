'use strict';

const { pickByNumber, parseQuantity } = require('../src/services/whatsapp-bot/catalog');
const { normalizeInbound, toDigits } = require('../src/services/whatsapp-bot/provider');
const { computeDeliveryFee, haversineKm } = require('../src/lib/delivery-fee');

describe('catalog :: selección numerada', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  test('pickByNumber devuelve el elemento 1-based', () => {
    expect(pickByNumber(list, '2')).toEqual({ id: 'b' });
    expect(pickByNumber(list, ' 1 ')).toEqual({ id: 'a' });
  });

  test('pickByNumber rechaza fuera de rango / no numérico', () => {
    expect(pickByNumber(list, '0')).toBeNull();
    expect(pickByNumber(list, '4')).toBeNull();
    expect(pickByNumber(list, 'hola')).toBeNull();
  });

  test('parseQuantity acepta 1..50 y extrae dígitos', () => {
    expect(parseQuantity('3')).toBe(3);
    expect(parseQuantity('quiero 4')).toBe(4);
    expect(parseQuantity('0')).toBeNull();
    expect(parseQuantity('99')).toBeNull();
    expect(parseQuantity('ninguno')).toBeNull();
  });
});

describe('provider :: normalizeInbound', () => {
  test('normaliza formato WHAPI (texto)', () => {
    const body = {
      messages: [
        { id: 'wamid.1', chat_id: '5215511112222@s.whatsapp.net', from_name: 'Luis', type: 'text', text: { body: 'hola' } },
        { id: 'wamid.self', from_me: true, type: 'text', text: { body: 'ignórame' } },
      ],
    };
    const out = normalizeInbound(body);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'wamid.1', from: '5215511112222', fromName: 'Luis', type: 'text', text: 'hola' });
  });

  test('normaliza ubicación WHAPI', () => {
    const body = { messages: [{ id: 'l1', from: '5215511112222', type: 'location', location: { latitude: 19.4, longitude: -99.1 } }] };
    const [msg] = normalizeInbound(body);
    expect(msg.type).toBe('location');
    expect(msg.location).toEqual({ lat: 19.4, lng: -99.1 });
  });

  test('normaliza formato META (texto + contacto)', () => {
    const body = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: '5215511112222', profile: { name: 'Mar' } }],
                messages: [{ id: 'meta.1', from: '5215511112222', type: 'text', text: { body: 'menu' } }],
              },
            },
          ],
        },
      ],
    };
    const out = normalizeInbound(body);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ from: '5215511112222', fromName: 'Mar', text: 'menu' });
  });

  test('tipos no soportados quedan marcados como other', () => {
    const body = { messages: [{ id: 'i1', from: '5215511112222', type: 'image', image: {} }] };
    expect(normalizeInbound(body)[0].type).toBe('other');
  });

  test('body desconocido → lista vacía', () => {
    expect(normalizeInbound({})).toEqual([]);
    expect(normalizeInbound(null)).toEqual([]);
  });

  test('toDigits limpia formato', () => {
    expect(toDigits('+52 1 (55) 1111-2222')).toBe('5215511112222');
    expect(toDigits('5215511112222@s.whatsapp.net')).toBe('5215511112222');
  });
});

describe('delivery-fee :: computeDeliveryFee', () => {
  test('FLAT devuelve la tarifa fija', () => {
    expect(computeDeliveryFee({ deliveryMode: 'FLAT', deliveryFee: 30 }, 100, null)).toEqual({ fee: 30, distanceKm: null, error: null });
  });

  test('envío gratis por monto de compra', () => {
    expect(computeDeliveryFee({ deliveryMode: 'FLAT', deliveryFee: 30, freeDeliveryFrom: 200 }, 250, null).fee).toBe(0);
  });

  test('DISTANCE cobra base + perKm', () => {
    const cfg = { deliveryMode: 'DISTANCE', originLat: 19.4, originLng: -99.1, deliveryBaseFee: 20, deliveryPerKm: 10, deliveryMaxKm: 50 };
    const res = computeDeliveryFee(cfg, 100, { lat: 19.45, lng: -99.1 });
    expect(res.error).toBeNull();
    expect(res.distanceKm).toBeGreaterThan(0);
    expect(res.fee).toBeCloseTo(20 + 10 * res.distanceKm, 1);
  });

  test('DISTANCE fuera de cobertura marca OUT_OF_RANGE', () => {
    const cfg = { deliveryMode: 'DISTANCE', originLat: 19.4, originLng: -99.1, deliveryBaseFee: 20, deliveryPerKm: 10, deliveryMaxKm: 1 };
    const res = computeDeliveryFee(cfg, 100, { lat: 20.5, lng: -99.9 });
    expect(res.error).toBe('OUT_OF_RANGE');
    expect(res.fee).toBe(0);
  });

  test('DISTANCE dentro del radio gratis no cobra', () => {
    const cfg = { deliveryMode: 'DISTANCE', originLat: 19.4, originLng: -99.1, deliveryBaseFee: 20, deliveryPerKm: 10, deliveryFreeRadiusKm: 100 };
    expect(computeDeliveryFee(cfg, 100, { lat: 19.41, lng: -99.11 }).fee).toBe(0);
  });

  test('haversine ~0 para el mismo punto', () => {
    expect(haversineKm(19.4, -99.1, 19.4, -99.1)).toBeCloseTo(0, 5);
  });
});
