'use strict';

// Tests del helper pick (allowlist contra mass assignment).
const { pick } = require('../src/lib/validate');

describe('pick', () => {
  it('copia solo los campos listados', () => {
    const body = { name: 'Tomate', isActive: false, restaurantId: 'OTRO', role: 'ADMIN' };
    expect(pick(body, ['name', 'isActive'])).toEqual({ name: 'Tomate', isActive: false });
  });

  it('conserva null (limpiar campo) pero omite undefined y ausentes', () => {
    expect(pick({ dateFrom: null, dateTo: undefined }, ['dateFrom', 'dateTo', 'title']))
      .toEqual({ dateFrom: null });
  });

  it('tolera body no-objeto', () => {
    expect(pick(null, ['a'])).toEqual({});
    expect(pick('hack', ['a'])).toEqual({});
  });

  it('ignora campos heredados del prototipo', () => {
    const body = Object.create({ restaurantId: 'inyectado' });
    body.name = 'ok';
    expect(pick(body, ['name', 'restaurantId'])).toEqual({ name: 'ok' });
  });
});
