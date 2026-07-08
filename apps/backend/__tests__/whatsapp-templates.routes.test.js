'use strict';

// Tests de las rutas de plantillas de WhatsApp (proxy a la Graph API de Meta):
//  - Con Whapi (o sin wabaId) responde 409 NOT_META.
//  - Con Meta lista/crea/elimina contra graph.facebook.com con el token del tenant.
// Mockeamos Prisma, axios y el auth middleware.

let mockAxios;

jest.mock('@mrtpvrest/database', () => ({
  prisma: { integrationConfig: { findFirst: jest.fn() } },
}));

jest.mock('axios', () => {
  mockAxios = {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  };
  return mockAxios;
});

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'u1', restaurantId: 'r1', role: 'ADMIN' };
    next();
  },
  requireTenantAccess: (_req, _res, next) => next(),
  requireAdmin: (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const templatesRoutes = require('../src/routes/whatsapp-templates.routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/whatsapp/templates', templatesRoutes);
  return app;
}

const META_INTEGRATION = {
  config: JSON.stringify({ provider: 'META', token: 'meta-token', phoneNumberId: '111', wabaId: 'waba-9' }),
};
const WHAPI_INTEGRATION = {
  config: JSON.stringify({ provider: 'WHAPI', token: 'whapi-token' }),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/whatsapp/templates', () => {
  test('con Whapi responde 409 NOT_META', async () => {
    prisma.integrationConfig.findFirst.mockResolvedValue(WHAPI_INTEGRATION);

    const res = await request(makeApp()).get('/api/whatsapp/templates');

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_META');
    expect(mockAxios.get).not.toHaveBeenCalled();
  });

  test('con Meta lista plantillas normalizadas con su estado', async () => {
    prisma.integrationConfig.findFirst.mockResolvedValue(META_INTEGRATION);
    mockAxios.get.mockResolvedValue({
      data: {
        data: [
          {
            id: 't1',
            name: 'pedido_en_camino',
            status: 'APPROVED',
            category: 'UTILITY',
            language: 'es_MX',
            components: [
              { type: 'BODY', text: 'Hola {{1}}, tu pedido va en camino.' },
              { type: 'FOOTER', text: 'Gracias por tu compra' },
            ],
          },
        ],
      },
    });

    const res = await request(makeApp()).get('/api/whatsapp/templates');

    expect(res.status).toBe(200);
    expect(res.body.templates).toEqual([
      expect.objectContaining({
        name: 'pedido_en_camino',
        status: 'APPROVED',
        bodyText: 'Hola {{1}}, tu pedido va en camino.',
        footerText: 'Gracias por tu compra',
      }),
    ]);
    // La llamada va al WABA del tenant con su token.
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/waba-9/message_templates'),
      expect.objectContaining({ headers: { Authorization: 'Bearer meta-token' } })
    );
  });
});

describe('POST /api/whatsapp/templates', () => {
  test('crea la plantilla en Meta (nombre normalizado, ejemplo para variables)', async () => {
    prisma.integrationConfig.findFirst.mockResolvedValue(META_INTEGRATION);
    mockAxios.post.mockResolvedValue({ data: { id: 'new-1', status: 'PENDING' } });

    const res = await request(makeApp())
      .post('/api/whatsapp/templates')
      .send({ name: 'Pedido Listo!', category: 'UTILITY', language: 'es_MX', bodyText: 'Hola {{1}}, tu pedido está listo.' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, status: 'PENDING', name: 'pedido_listo_' });

    const [, payload] = mockAxios.post.mock.calls[0];
    expect(payload.name).toBe('pedido_listo_');
    expect(payload.components[0]).toMatchObject({
      type: 'BODY',
      example: { body_text: [['ejemplo 1']] },
    });
  });

  test('rechaza cuerpo vacío sin llamar a Meta', async () => {
    prisma.integrationConfig.findFirst.mockResolvedValue(META_INTEGRATION);

    const res = await request(makeApp())
      .post('/api/whatsapp/templates')
      .send({ name: 'x', bodyText: '' });

    expect(res.status).toBe(400);
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  test('re-expone el mensaje de error de Meta (ej. nombre duplicado)', async () => {
    prisma.integrationConfig.findFirst.mockResolvedValue(META_INTEGRATION);
    mockAxios.post.mockRejectedValue({
      response: { status: 400, data: { error: { error_user_msg: 'Ya existe una plantilla con ese nombre.' } } },
    });

    const res = await request(makeApp())
      .post('/api/whatsapp/templates')
      .send({ name: 'duplicada', bodyText: 'Hola' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Ya existe una plantilla con ese nombre.');
  });
});

describe('DELETE /api/whatsapp/templates/:name', () => {
  test('elimina por nombre contra el WABA del tenant', async () => {
    prisma.integrationConfig.findFirst.mockResolvedValue(META_INTEGRATION);
    mockAxios.delete.mockResolvedValue({ data: { success: true } });

    const res = await request(makeApp()).delete('/api/whatsapp/templates/pedido_en_camino');

    expect(res.status).toBe(200);
    expect(mockAxios.delete).toHaveBeenCalledWith(
      expect.stringContaining('/waba-9/message_templates'),
      expect.objectContaining({ params: { name: 'pedido_en_camino' } })
    );
  });
});
