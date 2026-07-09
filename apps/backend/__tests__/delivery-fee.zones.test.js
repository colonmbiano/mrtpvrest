'use strict';

// Tests del modo ZONES de computeDeliveryFee (envío por polígono) y de los
// helpers puros pointInPolygon / findZoneForPoint. lib/delivery-fee.js es la
// fuente única de verdad compartida por la tienda web y el bot de WhatsApp.

const {
  computeDeliveryFee,
  pointInPolygon,
  findZoneForPoint,
} = require('../src/lib/delivery-fee');

// Cuadrado alrededor del centro de CDMX (lat 19.40–19.44, lng -99.16 – -99.12).
const SQUARE = [
  { lat: 19.40, lng: -99.16 },
  { lat: 19.44, lng: -99.16 },
  { lat: 19.44, lng: -99.12 },
  { lat: 19.40, lng: -99.12 },
];
const INSIDE = { lat: 19.42, lng: -99.14 };
const OUTSIDE = { lat: 19.50, lng: -99.14 };

describe('pointInPolygon', () => {
  test('detecta un punto dentro del polígono', () => {
    expect(pointInPolygon(INSIDE.lat, INSIDE.lng, SQUARE)).toBe(true);
  });
  test('detecta un punto fuera del polígono', () => {
    expect(pointInPolygon(OUTSIDE.lat, OUTSIDE.lng, SQUARE)).toBe(false);
  });
  test('polígono con menos de 3 vértices nunca contiene', () => {
    expect(pointInPolygon(INSIDE.lat, INSIDE.lng, [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }])).toBe(false);
    expect(pointInPolygon(INSIDE.lat, INSIDE.lng, null)).toBe(false);
  });
});

describe('findZoneForPoint · prioridad en solapes', () => {
  test('devuelve la primera zona (ya ordenada) que contiene el punto', () => {
    const zones = [
      { id: 'cheap', fee: 20, active: true, polygon: SQUARE },
      { id: 'expensive', fee: 99, active: true, polygon: SQUARE },
    ];
    expect(findZoneForPoint(zones, INSIDE.lat, INSIDE.lng).id).toBe('cheap');
  });
  test('ignora zonas inactivas', () => {
    const zones = [
      { id: 'off', fee: 20, active: false, polygon: SQUARE },
      { id: 'on', fee: 45, active: true, polygon: SQUARE },
    ];
    expect(findZoneForPoint(zones, INSIDE.lat, INSIDE.lng).id).toBe('on');
  });
  test('null si el punto queda fuera de todas', () => {
    const zones = [{ id: 'z', fee: 20, active: true, polygon: SQUARE }];
    expect(findZoneForPoint(zones, OUTSIDE.lat, OUTSIDE.lng)).toBeNull();
  });
});

describe('computeDeliveryFee · modo ZONES', () => {
  const baseConfig = {
    deliveryMode: 'ZONES',
    deliveryFee: 50, // fallback cuando no hay coordenadas
    deliveryZones: [{ id: 'centro', name: 'Centro', fee: 35, active: true, polygon: SQUARE }],
  };

  test('cobra la tarifa de la zona que contiene al cliente', () => {
    const r = computeDeliveryFee(baseConfig, 200, INSIDE);
    expect(r).toMatchObject({ fee: 35, error: null, zoneId: 'centro', zoneName: 'Centro' });
  });

  test('fuera de toda zona → OUT_OF_RANGE (sin cobertura)', () => {
    const r = computeDeliveryFee(baseConfig, 200, OUTSIDE);
    expect(r.error).toBe('OUT_OF_RANGE');
    expect(r.fee).toBe(0);
  });

  test('sin coordenadas → cae a la tarifa fija como respaldo', () => {
    const r = computeDeliveryFee(baseConfig, 200, null);
    expect(r).toMatchObject({ fee: 50, error: null });
  });

  test('envío gratis por monto gana incluso en modo ZONES', () => {
    const cfg = { ...baseConfig, freeDeliveryFrom: 150 };
    const r = computeDeliveryFee(cfg, 200, INSIDE);
    expect(r.fee).toBe(0);
    expect(r.error).toBeNull();
  });

  test('sin zonas configuradas y con coordenadas → OUT_OF_RANGE', () => {
    const r = computeDeliveryFee({ deliveryMode: 'ZONES', deliveryZones: [] }, 200, INSIDE);
    expect(r.error).toBe('OUT_OF_RANGE');
  });
});
