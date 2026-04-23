/**
 * voice-agent.service.js — FASE 5: Agente IA por voz para el TPV.
 *
 * Toma texto natural dictado por el dueño/gerente y decide qué acción
 * estructurada ejecutar sobre su tenant mediante tool_use de Anthropic.
 *
 * Herramientas expuestas:
 *   - record_expense(amount, category, description?)
 *     Crea un registro en `Expense` (FASE 4) para el tenant actual.
 *   - update_stock(ingredient, quantity)
 *     Suma/resta `quantity` al stock de un Ingredient del tenant (match
 *     case-insensitive por nombre, scopeado a las locations del tenant).
 *
 * Seguridad:
 *   - El tenantId SIEMPRE viene del JWT autenticado; nunca del body del
 *     cliente. El endpoint que llame a este servicio debe pasarlo ya
 *     resuelto y validado.
 *
 * Modelo: claude-sonnet-4-6 (buen tool-use en español, costo razonable).
 * Llamada vía axios → Anthropic Messages API (sin SDK, consistente con
 * onboarding.routes.js).
 */

const axios = require('axios');
const { prisma } = require('@mrtpvrest/database');

const MODEL = process.env.ANTHROPIC_VOICE_AGENT_MODEL || 'claude-sonnet-4-6';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const EXPENSE_CATEGORIES = ['GASOLINA', 'REFACCION', 'PONCHADURA', 'OTROS'];

const SYSTEM_PROMPT = `Eres el asistente por voz de un restaurante. El dueño o gerente te dicta
acciones que quieren registrar en su sistema y tu trabajo es decidir qué
herramienta usar y con qué parámetros.

Reglas:
- Si la instrucción es clara (ej. "gasté 500 en gasolina"), llama directamente
  a la herramienta apropiada.
- Si falta información crítica o la instrucción es ambigua, responde en texto
  pidiendo la aclaración — NO inventes.
- Si la instrucción queda fuera de alcance (no corresponde a gastos ni stock),
  explica brevemente qué sí puedes hacer.
- Para gastos, mapea categorías libres a la enum:
    "gasolina/nafta/combustible"      → GASOLINA
    "llanta/neumático/ponchadura"     → PONCHADURA
    "refacción/repuesto/pieza"        → REFACCION
    todo lo demás                     → OTROS
- Para stock, usa quantity POSITIVO si algo llegó o se repuso, NEGATIVO si se
  consumió. Si el usuario solo dice "tengo 50 tomates" sin contexto de flujo,
  asume que es ingreso (positivo).
- Responde SIEMPRE en español.`;

const TOOLS = [
  {
    name: 'record_expense',
    description:
      'Registra un gasto operativo para el tenant actual. Úsalo cuando el dueño diga cosas como "gasté 500 en gasolina", "pagué una refacción de 1200", "compré una llanta en 800".',
    input_schema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Monto en pesos (MXN), positivo.',
        },
        category: {
          type: 'string',
          enum: EXPENSE_CATEGORIES,
          description: 'Categoría del gasto, una de las enumeradas.',
        },
        description: {
          type: 'string',
          description: 'Descripción corta y opcional del gasto.',
        },
      },
      required: ['amount', 'category'],
    },
  },
  {
    name: 'update_stock',
    description:
      'Actualiza (suma o resta) el stock de un ingrediente por su nombre. quantity positivo para ingresos/recepciones, negativo para consumos.',
    input_schema: {
      type: 'object',
      properties: {
        ingredient: {
          type: 'string',
          description: 'Nombre del ingrediente (búsqueda case-insensitive).',
        },
        quantity: {
          type: 'number',
          description:
            'Delta a aplicar al stock. Positivo = ingreso, negativo = consumo.',
        },
      },
      required: ['ingredient', 'quantity'],
    },
  },
];

const fmtCurrency = n =>
  `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0 })}`;

// ── Tool implementations ────────────────────────────────────────────────────
async function toolRecordExpense({ tenantId, args }) {
  const amount = Number(args.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Monto inválido' };
  }
  const category = EXPENSE_CATEGORIES.includes(args.category)
    ? args.category
    : 'OTROS';

  const expense = await prisma.expense.create({
    data: {
      tenantId,
      amount,
      category,
      description: args.description?.trim() || null,
    },
  });

  return {
    ok: true,
    summary: `Gasto de ${fmtCurrency(amount)} en ${category} registrado exitosamente.`,
    data: { id: expense.id, amount, category, description: expense.description },
  };
}

async function toolUpdateStock({ tenantId, locationId, args }) {
  const delta = Number(args.quantity);
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, error: 'Cantidad inválida o cero' };
  }
  const needle = String(args.ingredient || '').trim();
  if (!needle) return { ok: false, error: 'Nombre de ingrediente requerido' };

  // Limitamos el match a ingredientes cuya location pertenezca a este tenant.
  // Si hay locationId en el request, priorizamos esa sucursal.
  const where = {
    isActive: true,
    name: { equals: needle, mode: 'insensitive' },
    location: { restaurant: { tenantId } },
  };
  if (locationId) where.locationId = locationId;

  let ingredient = await prisma.ingredient.findFirst({ where });

  if (!ingredient && locationId) {
    // Fallback: buscar en cualquier location del tenant.
    ingredient = await prisma.ingredient.findFirst({
      where: {
        isActive: true,
        name: { equals: needle, mode: 'insensitive' },
        location: { restaurant: { tenantId } },
      },
    });
  }

  if (!ingredient) {
    return {
      ok: false,
      error: `No encontré el ingrediente "${needle}" en tu inventario.`,
    };
  }

  const newStock = Number(ingredient.stock) + delta;
  const updated = await prisma.ingredient.update({
    where: { id: ingredient.id },
    data: { stock: newStock },
  });

  // Registrar movimiento (auditoría). No bloquea si falla.
  await prisma.inventoryMovement
    .create({
      data: {
        ingredientId: ingredient.id,
        quantity: delta,
        type: delta > 0 ? 'IN' : 'OUT',
        reason: 'VOICE_AGENT',
      },
    })
    .catch(() => null);

  const verb = delta > 0 ? 'sumadas' : 'restadas';
  return {
    ok: true,
    summary: `${Math.abs(delta)} ${ingredient.unit} ${verb} a "${ingredient.name}". Stock actual: ${updated.stock} ${ingredient.unit}.`,
    data: {
      id: updated.id,
      name: updated.name,
      previousStock: Number(ingredient.stock),
      delta,
      newStock: Number(updated.stock),
      unit: updated.unit,
    },
  };
}

async function executeTool(name, args, ctx) {
  if (name === 'record_expense') return toolRecordExpense({ ...ctx, args });
  if (name === 'update_stock') return toolUpdateStock({ ...ctx, args });
  return { ok: false, error: `Herramienta no soportada: ${name}` };
}

// ── Main entry ──────────────────────────────────────────────────────────────
async function runVoiceAgent({ prompt, tenantId, locationId }) {
  if (!prompt?.trim()) {
    const err = new Error('prompt requerido');
    err.code = 'BAD_REQUEST';
    throw err;
  }
  if (!tenantId) {
    const err = new Error('tenantId requerido');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error(
      'Agente de voz no configurado: falta ANTHROPIC_API_KEY en el servidor.'
    );
    err.code = 'AI_KEY_REQUIRED';
    throw err;
  }

  let response;
  try {
    response = await axios.post(
      ANTHROPIC_URL,
      {
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: [{ role: 'user', content: prompt.trim() }],
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 20000,
      }
    );
  } catch (e) {
    const status = e?.response?.status;
    if (status === 429) {
      const err = new Error('Límite de uso alcanzado. Intenta de nuevo en un minuto.');
      err.code = 'RATE_LIMIT';
      throw err;
    }
    const msg = e?.response?.data?.error?.message || e.message;
    const err = new Error(`Error llamando al modelo: ${msg}`);
    err.code = 'UPSTREAM';
    throw err;
  }

  const content = response.data?.content || [];
  const toolUses = content.filter(b => b.type === 'tool_use');
  const textBlocks = content.filter(b => b.type === 'text');

  // Si el modelo decidió no llamar a ninguna herramienta, devolvemos su texto
  // (típicamente una aclaración o ayuda para reformular la orden).
  if (toolUses.length === 0) {
    const text =
      textBlocks.map(b => b.text).join('\n').trim() ||
      'No entendí la instrucción. ¿Puedes repetirla?';
    return { ok: true, action: null, message: text };
  }

  // Ejecutamos SOLO la primera tool_use (una acción por dictado).
  const call = toolUses[0];
  const result = await executeTool(call.name, call.input || {}, {
    tenantId,
    locationId,
  });

  if (!result.ok) {
    return { ok: false, action: call.name, message: result.error };
  }

  return {
    ok: true,
    action: call.name,
    message: result.summary,
    data: result.data,
  };
}

module.exports = { runVoiceAgent };
