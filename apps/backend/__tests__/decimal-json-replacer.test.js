'use strict';

// Test de la Etapa 0 de la migración Float→Decimal: el replacer JSON global
// serializa los Decimal de Prisma como number (no string), así el contrato
// HTTP de los frontends no cambia al migrar columnas.
//
// GOTCHA que cubre: JSON.stringify llama toJSON() ANTES del replacer —
// decimal.js define toJSON→string, así que el replacer debe mirar el valor
// CRUDO en this[key], no el `value` que recibe.

const express = require('express');
const request = require('supertest');

// Simula el Decimal de decimal.js: toJSON/valueOf devuelven string.
class Decimal {
  constructor(v) { this._v = String(v); }
  toJSON() { return this._v; }
  toString() { return this._v; }
  valueOf() { return this._v; }
}

function buildApp() {
  const app = express();
  // Copia exacta del replacer de src/index.js.
  app.set('json replacer', function (key, value) {
    const raw = this ? this[key] : undefined;
    if (raw && typeof raw === 'object' && raw.constructor?.name === 'Decimal') {
      return Number(raw);
    }
    return value;
  });
  app.get('/t', (_req, res) => res.json({
    total: new Decimal('125.50'),
    nested: { discountValue: new Decimal('50.00'), name: 'Promo' },
    list: [new Decimal('0.10'), 7, 'texto'],
    nullish: null,
  }));
  return app;
}

describe('json replacer Decimal→number (Etapa 0 plan Decimal)', () => {
  it('serializa Decimal como number en raíz, anidado y arrays', async () => {
    const res = await request(buildApp()).get('/t');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(125.5);
    expect(res.body.nested.discountValue).toBe(50);
    expect(res.body.list).toEqual([0.1, 7, 'texto']);
    expect(res.body.nullish).toBeNull();
    expect(res.body.nested.name).toBe('Promo');
  });
});
