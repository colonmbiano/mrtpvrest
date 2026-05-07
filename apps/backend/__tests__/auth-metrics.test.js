'use strict';

describe('lib/auth-metrics', () => {
  // Reset del cache de require para aislar el estado entre tests.
  // El módulo es singleton in-memory, así que sin esto los contadores
  // se acumularían cross-test.
  let increment, getAuthCounters;

  beforeEach(() => {
    jest.resetModules();
    ({ increment, getAuthCounters } = require('../src/lib/auth-metrics'));
  });

  test('todos los contadores comienzan en 0', () => {
    const { counters } = getAuthCounters();
    Object.values(counters).forEach((v) => expect(v).toBe(0));
  });

  test('increment suma 1 al contador correspondiente', () => {
    increment('token_expired');
    increment('token_expired');
    increment('success');

    const { counters } = getAuthCounters();
    expect(counters.token_expired).toBe(2);
    expect(counters.success).toBe(1);
    expect(counters.token_missing).toBe(0);
  });

  test('increment con clave desconocida no rompe', () => {
    expect(() => increment('foo_bar_baz')).not.toThrow();
    const { counters } = getAuthCounters();
    expect('foo_bar_baz' in counters).toBe(false);
  });

  test('getAuthCounters expone uptime y timestamp ISO', () => {
    const out = getAuthCounters();
    expect(typeof out.uptimeSeconds).toBe('number');
    expect(out.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(() => new Date(out.startedAt).toISOString()).not.toThrow();
  });
});
