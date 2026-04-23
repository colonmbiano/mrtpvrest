'use strict';

// Mocks antes de require()
jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    expense: { create: jest.fn() },
    ingredient: { findFirst: jest.fn(), update: jest.fn() },
    inventoryMovement: { create: jest.fn() },
    tenant: { findUnique: jest.fn() },
  },
}));

jest.mock('axios', () => ({ post: jest.fn() }));

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = {
      id: 'u1',
      role: 'ADMIN',
      restaurantId: 'r1',
      tenantId: 't1',
      isActive: true,
    };
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
  requireTenantAccess: (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const axios = require('axios');
const { prisma } = require('@mrtpvrest/database');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/ai', require('../src/routes/ai.routes'));
  return app;
}

// Helper: respuesta de Anthropic con un único tool_use.
function anthropicToolUseReply(name, input) {
  return {
    data: {
      id: 'msg_test',
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'tool_1', name, input }],
      stop_reason: 'tool_use',
    },
  };
}

// Helper: respuesta de Anthropic solo-texto (modelo no llamó a ninguna tool).
function anthropicTextReply(text) {
  return {
    data: {
      id: 'msg_test',
      role: 'assistant',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
    },
  };
}

describe('POST /api/ai/agent (FASE 5)', () => {
  const origKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';
  });

  afterAll(() => {
    if (origKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = origKey;
  });

  it('valida: responde 400 si falta prompt', async () => {
    const res = await request(buildApp())
      .post('/api/ai/agent')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/prompt/i);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('seguridad: 403 si el body incluye tenantId distinto al del JWT (anti-IDOR)', async () => {
    const res = await request(buildApp())
      .post('/api/ai/agent')
      .send({ prompt: 'gasté 500 en gasolina', tenantId: 'tenant-otro' });
    expect(res.status).toBe(403);
    expect(axios.post).not.toHaveBeenCalled();
    expect(prisma.expense.create).not.toHaveBeenCalled();
  });

  it('record_expense: ejecuta la tool y persiste el Expense con tenantId del JWT', async () => {
    axios.post.mockResolvedValueOnce(
      anthropicToolUseReply('record_expense', {
        amount: 500,
        category: 'GASOLINA',
        description: 'Llené la moto',
      })
    );
    prisma.expense.create.mockResolvedValueOnce({
      id: 'exp1',
      amount: 500,
      category: 'GASOLINA',
      description: 'Llené la moto',
    });

    const res = await request(buildApp())
      .post('/api/ai/agent')
      .send({ prompt: 'gasté 500 en gasolina para la moto' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.action).toBe('record_expense');
    expect(res.body.message).toMatch(/GASOLINA/);
    expect(prisma.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 't1', // ← del JWT, no del body
        amount: 500,
        category: 'GASOLINA',
        description: 'Llené la moto',
      }),
    });
  });

  it('record_expense: categoría inválida del modelo cae a OTROS (no rompe)', async () => {
    axios.post.mockResolvedValueOnce(
      anthropicToolUseReply('record_expense', {
        amount: 100,
        category: 'CATEGORIA_INVENTADA',
      })
    );
    prisma.expense.create.mockResolvedValueOnce({
      id: 'exp2',
      amount: 100,
      category: 'OTROS',
      description: null,
    });

    const res = await request(buildApp())
      .post('/api/ai/agent')
      .send({ prompt: 'gasté 100 en no-sé-qué' });

    expect(res.status).toBe(200);
    expect(prisma.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ category: 'OTROS' }),
    });
  });

  it('update_stock: aplica delta, persiste ingredient y registra movement', async () => {
    axios.post.mockResolvedValueOnce(
      anthropicToolUseReply('update_stock', {
        ingredient: 'Tomate',
        quantity: 20,
      })
    );
    prisma.ingredient.findFirst.mockResolvedValueOnce({
      id: 'ing1',
      name: 'Tomate',
      stock: 5,
      unit: 'kg',
    });
    prisma.ingredient.update.mockResolvedValueOnce({
      id: 'ing1',
      name: 'Tomate',
      stock: 25,
      unit: 'kg',
    });
    prisma.inventoryMovement.create.mockResolvedValueOnce({ id: 'mov1' });

    const res = await request(buildApp())
      .post('/api/ai/agent')
      .send({ prompt: 'me llegaron 20 kilos de tomate' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.action).toBe('update_stock');
    expect(res.body.data).toMatchObject({
      previousStock: 5,
      delta: 20,
      newStock: 25,
    });
    expect(prisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: 'ing1' },
      data: { stock: 25 },
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'IN', reason: 'VOICE_AGENT' }),
    });
  });

  it('update_stock: ingrediente no encontrado devuelve ok:false con mensaje claro', async () => {
    axios.post.mockResolvedValueOnce(
      anthropicToolUseReply('update_stock', {
        ingredient: 'Unicornio',
        quantity: 3,
      })
    );
    prisma.ingredient.findFirst.mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/api/ai/agent')
      .send({ prompt: 'anota 3 unicornios' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.message).toMatch(/Unicornio/);
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
  });

  it('sin tool_use: devuelve el texto del modelo (pide aclaración)', async () => {
    axios.post.mockResolvedValueOnce(
      anthropicTextReply('No entendí. ¿Es un gasto o un movimiento de stock?')
    );

    const res = await request(buildApp())
      .post('/api/ai/agent')
      .send({ prompt: 'eh no sé' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.action).toBeNull();
    expect(res.body.message).toMatch(/aclaraci|gasto o un movimiento/i);
    expect(prisma.expense.create).not.toHaveBeenCalled();
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
  });

  it('ANTHROPIC_API_KEY ausente: responde 402 con código AI_KEY_REQUIRED', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const res = await request(buildApp())
      .post('/api/ai/agent')
      .send({ prompt: 'gasté 500 en gasolina' });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('AI_KEY_REQUIRED');
    expect(axios.post).not.toHaveBeenCalled();
  });
});
