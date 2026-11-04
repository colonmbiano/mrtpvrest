'use strict';

// Tokens fijos de endpoints internos (src/lib/static-token.js): llegan en el header
// (Authorization: Bearer o X-Bot-Token) y ?token= solo donde se permite. Se prueba
// también por la ruta GET /api/bot-metrics, que lo usa con allowQuery.

jest.mock('@mrtpvrest/database', () => ({
  prisma: { restaurant: { findUnique: jest.fn().mockResolvedValue({ name: 'Master' }) } },
}));
jest.mock('../src/services/whatsapp-bot-metrics.service', () => ({
  computeBotMetrics: jest.fn().mockResolvedValue({ conversaciones: 3 }),
  renderMetricsHtml: jest.fn(() => '<p>métricas</p>'),
  defaultRestaurantId: jest.fn(() => 'r1'),
}));

const express = require('express');
const request = require('supertest');
const { matchesStaticToken } = require('../src/lib/static-token');

const TOKEN = 'token-de-prueba-0123456789';
const req = ({ headers = {}, query = {} } = {}) => ({ headers, query });

describe('matchesStaticToken', () => {
  it('acepta el token en Authorization: Bearer o en X-Bot-Token', () => {
    expect(matchesStaticToken(req({ headers: { authorization: `Bearer ${TOKEN}` } }), TOKEN)).toBe(true);
    expect(matchesStaticToken(req({ headers: { 'x-bot-token': TOKEN } }), TOKEN)).toBe(true);
  });

  it('rechaza un token distinto, de otro largo o vacío', () => {
    expect(matchesStaticToken(req({ headers: { authorization: `Bearer ${TOKEN}x` } }), TOKEN)).toBe(false);
    expect(matchesStaticToken(req({ headers: { 'x-bot-token': 'corto' } }), TOKEN)).toBe(false);
    expect(matchesStaticToken(req({ headers: { authorization: 'Bearer ' } }), TOKEN)).toBe(false);
    expect(matchesStaticToken(req(), TOKEN)).toBe(false);
  });

  it('sin token configurado no deja pasar a nadie', () => {
    expect(matchesStaticToken(req({ headers: { 'x-bot-token': '' } }), undefined)).toBe(false);
    expect(matchesStaticToken(req({ query: { token: '' } }), '', { allowQuery: true })).toBe(false);
  });

  it('?token= solo cuenta con allowQuery', () => {
    expect(matchesStaticToken(req({ query: { token: TOKEN } }), TOKEN)).toBe(false);
    expect(matchesStaticToken(req({ query: { token: TOKEN } }), TOKEN, { allowQuery: true })).toBe(true);
    // Un parámetro repetido llega como arreglo: no se acepta.
    expect(matchesStaticToken(req({ query: { token: [TOKEN, TOKEN] } }), TOKEN, { allowQuery: true })).toBe(false);
  });
});

describe('GET /api/bot-metrics', () => {
  const app = express();
  app.use('/api/bot-metrics', require('../src/routes/bot-metrics.routes'));
  const OLD_ENV = process.env.BOT_METRICS_TOKEN;
  beforeEach(() => { process.env.BOT_METRICS_TOKEN = TOKEN; });
  afterAll(() => {
    if (OLD_ENV === undefined) delete process.env.BOT_METRICS_TOKEN;
    else process.env.BOT_METRICS_TOKEN = OLD_ENV;
  });

  it('abre con el header', async () => {
    const res = await request(app).get('/api/bot-metrics?format=json').set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ conversaciones: 3 });
  });

  it('sigue abriendo como enlace con ?token=', async () => {
    const res = await request(app).get(`/api/bot-metrics?token=${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('métricas');
  });

  it('responde 403 con un token equivocado, sin token o sin BOT_METRICS_TOKEN', async () => {
    expect((await request(app).get('/api/bot-metrics?token=otro')).status).toBe(403);
    expect((await request(app).get('/api/bot-metrics')).status).toBe(403);
    delete process.env.BOT_METRICS_TOKEN;
    expect((await request(app).get('/api/bot-metrics?token=')).status).toBe(403);
  });
});
