// Claude-powered admin assistant for the restaurant dashboard.
// Read-only MVP: 4 tools that query aggregated data scoped to the current
// restaurantId + locationId of the request.
//
// Model: claude-opus-4-7 with adaptive thinking.
// Prompt caching: the frozen system block + tool schemas get cached
// (render order is tools -> system -> messages, breakpoint on block[0]).
// The per-request context (restaurant name, location, today) lives in a
// second, non-cached system block so it doesn't invalidate the prefix.
//
// Agentic loop: manual, stops on stop_reason === 'end_turn' or a hard
// iteration cap (MAX_ITERATIONS) for safety.

const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
const { prisma } = require('@mrtpvrest/database');

const MODEL = 'claude-opus-4-7';
const MAX_TOKENS = 8000;
const MAX_ITERATIONS = 8;

const SYSTEM_PROMPT = `Eres el asistente administrativo de MRTPVREST, un SaaS de gestión de restaurantes.
Tu rol es ayudar al dueño/gerente a entender su operación respondiendo en español neutro, con cifras concretas.

Reglas:
- Usa SIEMPRE las herramientas disponibles para obtener datos actualizados antes de responder a preguntas sobre ventas, productos, inventario o personal. Nunca inventes cifras.
- Si el usuario hace una pregunta de saludo o fuera de alcance, responde brevemente sin llamar herramientas.
- Cuando presentes resultados, usa formato claro: viñetas para listas, moneda en pesos (usa el símbolo $ y agrupa miles), y resalta la cifra principal en negrita con **markdown**.
- Si una herramienta devuelve un array vacío, di honestamente "no hay datos" y sugiere la acción (p.ej. "aún no hay ventas registradas hoy" o "ningún ingrediente por debajo del mínimo").
- No puedes modificar datos; esta versión es solo de lectura.
- Mantén las respuestas concisas (bajo 120 palabras a menos que pidan un resumen extenso).`;

const TOOLS = [
  {
    name: 'get_sales_summary',
    description: 'Devuelve el resumen de ventas (ingresos totales, número de pedidos, ticket promedio) del período indicado, para el restaurante actual. Excluye pedidos cancelados.',
    input_schema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['HOY', '7D', '30D', 'AÑO'],
          description: 'Período a consultar. HOY = hoy, 7D = últimos 7 días, 30D = últimos 30 días, AÑO = año en curso.',
        },
      },
      required: ['period'],
    },
  },
  {
    name: 'get_top_products',
    description: 'Lista los productos más vendidos en el período, ordenados por cantidad vendida descendente. Devuelve nombre, cantidad vendida y monto total.',
    input_schema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['HOY', '7D', '30D', 'AÑO'],
          description: 'Período a consultar.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'Cantidad de productos a devolver (por defecto 5).',
        },
      },
      required: ['period'],
    },
  },
  {
    name: 'get_inventory_alerts',
    description: 'Lista ingredientes de la sucursal activa cuyo stock está en o por debajo del stock mínimo (minStock). Devuelve nombre, unidad, stock actual y stock mínimo. Si no hay una sucursal activa, devuelve un error.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_active_staff',
    description: 'Lista empleados con turno activo (EmployeeShift.endAt = null) en la sucursal activa: nombre, rol, mesas asignadas, y hora de inicio del turno. Si no hay una sucursal activa, devuelve un error.',
    input_schema: { type: 'object', properties: {} },
  },
].sort((a, b) => a.name.localeCompare(b.name));

function periodRange(period) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const p = String(period || 'HOY').toUpperCase();
  if (p === '7D') from.setDate(from.getDate() - 6);
  else if (p === '30D') from.setDate(from.getDate() - 29);
  else if (p === 'AÑO' || p === 'ANIO' || p === 'ANO') from.setMonth(0, 1);
  return from;
}

async function execTool(name, input, { restaurantId, locationId }) {
  if (name === 'get_sales_summary') {
    const from = periodRange(input.period);
    const where = {
      restaurantId,
      status: { not: 'CANCELLED' },
      createdAt: { gte: from },
    };
    const agg = await prisma.order.aggregate({
      where,
      _sum: { total: true },
      _count: { id: true },
      _avg: { total: true },
    });
    return {
      period: input.period,
      totalRevenue: Math.round(agg._sum.total || 0),
      totalOrders: agg._count.id || 0,
      averageTicket: Math.round(agg._avg.total || 0),
    };
  }

  if (name === 'get_top_products') {
    const from = periodRange(input.period);
    const limit = Math.min(Math.max(parseInt(input.limit) || 5, 1), 20);
    const items = await prisma.orderItem.groupBy({
      by: ['name'],
      where: {
        order: {
          restaurantId,
          status: { not: 'CANCELLED' },
          createdAt: { gte: from },
          ...(locationId ? { locationId } : {}),
        },
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });
    return items.map((i) => ({
      name: i.name,
      quantity: i._sum.quantity || 0,
      total: Math.round(i._sum.subtotal || 0),
    }));
  }

  if (name === 'get_inventory_alerts') {
    if (!locationId) return { error: 'Sin sucursal activa. Pide al usuario que seleccione una en el selector del sidebar.' };
    const items = await prisma.ingredient.findMany({
      where: { locationId, minStock: { gt: 0 } },
      select: { id: true, name: true, unit: true, stock: true, minStock: true },
    });
    return items
      .filter((i) => i.stock <= i.minStock)
      .sort((a, b) => (a.stock / (a.minStock || 1)) - (b.stock / (b.minStock || 1)))
      .map((i) => ({ name: i.name, unit: i.unit, stock: i.stock, minStock: i.minStock }));
  }

  if (name === 'get_active_staff') {
    if (!locationId) return { error: 'Sin sucursal activa.' };
    const shifts = await prisma.employeeShift.findMany({
      where: { endAt: null, employee: { locationId } },
      include: { employee: { select: { name: true, role: true, tables: true } } },
      orderBy: { startAt: 'asc' },
      take: 30,
    });
    return shifts.map((s) => ({
      name: s.employee.name,
      role: s.employee.role,
      tables: s.employee.tables,
      startAt: s.startAt,
    }));
  }

  return { error: `Herramienta desconocida: ${name}` };
}

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('ANTHROPIC_API_KEY no está configurada en el backend.');
    err.code = 'ASSISTANT_UNCONFIGURED';
    throw err;
  }
  return new Anthropic();
}

async function buildContextBlock({ restaurantId, locationId }) {
  const [restaurant, location] = await Promise.all([
    restaurantId
      ? prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } })
      : null,
    locationId
      ? prisma.location.findUnique({ where: { id: locationId }, select: { name: true } })
      : null,
  ]);
  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  return [
    'Contexto de esta sesión:',
    `- Restaurante: ${restaurant?.name || '(sin nombre)'}`,
    `- Sucursal activa: ${location?.name || '(ninguna — algunas herramientas no estarán disponibles)'}`,
    `- Fecha actual: ${today}`,
  ].join('\n');
}

async function runAssistant({ messages, restaurantId, locationId }) {
  const client = getClient();

  if (!Array.isArray(messages) || messages.length === 0) {
    throw Object.assign(new Error('Se requiere un arreglo `messages` no vacío.'), { code: 'BAD_REQUEST' });
  }

  const contextBlock = await buildContextBlock({ restaurantId, locationId });

  // Normalize: client sends [{role, content: string|array}]. Keep tool_use /
  // tool_result blocks intact if they arrive (multi-turn after a prior call).
  const convo = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let response;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'adaptive' },
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: contextBlock },
        ],
        tools: TOOLS,
        messages: convo,
      });
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        const wrapped = new Error(error.message || 'Error al consultar Claude');
        wrapped.status = error.status;
        wrapped.code = error.status === 429 ? 'RATE_LIMIT' : 'UPSTREAM';
        throw wrapped;
      }
      throw error;
    }

    // Append assistant turn (preserve full content — tool_use blocks included).
    convo.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn' || response.stop_reason === 'stop_sequence') {
      return { messages: convo, usage: response.usage };
    }

    if (response.stop_reason !== 'tool_use') {
      // max_tokens / refusal / pause_turn (not expected here): stop gracefully.
      return { messages: convo, usage: response.usage, stopReason: response.stop_reason };
    }

    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    const toolResults = [];
    for (const tu of toolUses) {
      let payload;
      try {
        payload = await execTool(tu.name, tu.input || {}, { restaurantId, locationId });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(payload),
        });
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: `Error ejecutando ${tu.name}: ${err.message}`,
          is_error: true,
        });
      }
    }
    convo.push({ role: 'user', content: toolResults });
  }

  // Iteration cap reached — append a synthetic user note so the last assistant
  // message isn't a dangling tool_use.
  convo.push({
    role: 'user',
    content: `Se alcanzó el límite de ${MAX_ITERATIONS} iteraciones. Resume lo que sepas hasta ahora.`,
  });
  const final = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'adaptive' },
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: contextBlock },
    ],
    tools: TOOLS,
    messages: convo,
  });
  convo.push({ role: 'assistant', content: final.content });
  return { messages: convo, usage: final.usage, stopReason: 'iteration_limit' };
}

module.exports = { runAssistant };
