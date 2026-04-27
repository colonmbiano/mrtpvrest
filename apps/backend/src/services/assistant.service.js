// Asistente administrativo del dashboard, migrado de Gemini a Groq Cloud.
// Usa el SDK oficial de OpenAI apuntando a Groq (baseURL https://api.groq.com/openai/v1)
// con el modelo llama-3.1-8b-instant. Expone runAssistant({ messages, restaurantId, locationId })
// con 4 herramientas read-only (function calling) que consultan Prisma scoped por restaurante
// y, cuando aplica, por sucursal.

const OpenAI = require('openai');
const { prisma } = require('@mrtpvrest/database');
const { resolveGroqKey } = require('./ai-key.service');
const { GROQ_BASE_URL, GROQ_MODEL, wrapGroqError } = require('./groq-error');

const MAX_ITERATIONS = 6;

const SYSTEM_PROMPT = `Eres el asistente administrativo de MRTPVREST, un SaaS de gestión de restaurantes.
Ayudas al dueño/gerente a entender su operación respondiendo en español neutro, con cifras concretas.

Reglas:
- Usa SIEMPRE las herramientas para obtener datos actualizados antes de responder preguntas sobre ventas, productos, inventario o personal. Nunca inventes cifras.
- Si el usuario saluda o pregunta algo fuera de alcance, responde breve sin llamar herramientas.
- Presenta resultados claros: viñetas para listas, moneda en pesos con símbolo $ y agrupación de miles, y resalta la cifra principal con **markdown**.
- Si una herramienta devuelve lista vacía, di honestamente "no hay datos" y sugiere la acción (p. ej. "aún no hay ventas hoy" o "ningún ingrediente por debajo del mínimo").
- Esta versión es sólo de lectura, no puedes modificar datos.
- Respuestas concisas (bajo 120 palabras salvo que pidan un resumen extenso).`;

// Las 4 herramientas mapeadas al formato function calling de OpenAI/Groq.
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_sales_summary',
      description: 'Devuelve ingresos totales, número de pedidos y ticket promedio del período indicado, para el restaurante actual. Excluye pedidos cancelados.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['HOY', '7D', '30D', 'AÑO'],
            description: 'HOY = hoy, 7D = últimos 7 días, 30D = últimos 30 días, AÑO = año en curso.',
          },
        },
        required: ['period'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_products',
      description: 'Lista los productos más vendidos en el período, ordenados por cantidad descendente. Devuelve nombre, cantidad vendida y monto total.',
      parameters: {
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
            description: 'Cantidad de productos a devolver (1–20, por defecto 5).',
          },
        },
        required: ['period'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_inventory_alerts',
      description: 'Lista ingredientes de la sucursal activa cuyo stock está en o por debajo del stock mínimo. Devuelve nombre, unidad, stock actual y stock mínimo. Requiere sucursal activa.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_active_staff',
      description: 'Lista empleados con turno activo (EmployeeShift abierto) en la sucursal activa: nombre, rol, mesas y hora de inicio. Requiere sucursal activa.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
];

function periodRange(period) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const p = String(period || 'HOY').toUpperCase();
  if (p === '7D') from.setDate(from.getDate() - 6);
  else if (p === '30D') from.setDate(from.getDate() - 29);
  else if (p === 'AÑO' || p === 'ANIO' || p === 'ANO') from.setMonth(0, 1);
  return from;
}

async function execTool(name, args, { restaurantId, locationId }) {
  if (name === 'get_sales_summary') {
    const from = periodRange(args.period);
    const agg = await prisma.order.aggregate({
      where: {
        restaurantId,
        status: { not: 'CANCELLED' },
        createdAt: { gte: from },
      },
      _sum: { total: true },
      _count: { id: true },
      _avg: { total: true },
    });
    return {
      period: args.period,
      totalRevenue: Math.round(agg._sum.total || 0),
      totalOrders: agg._count.id || 0,
      averageTicket: Math.round(agg._avg.total || 0),
    };
  }

  if (name === 'get_top_products') {
    const from = periodRange(args.period);
    const limit = Math.min(Math.max(parseInt(args.limit) || 5, 1), 20);
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
    'Contexto de la sesión:',
    `- Restaurante: ${restaurant?.name || '(sin nombre)'}`,
    `- Sucursal activa: ${location?.name || '(ninguna — herramientas por sucursal no disponibles)'}`,
    `- Fecha actual: ${today}`,
  ].join('\n');
}

function toText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n\n');
  }
  return '';
}

async function runAssistant({ messages, restaurantId, locationId }) {
  if (!Array.isArray(messages) || messages.length === 0) {
    const err = new Error('Se requiere un arreglo `messages` no vacío.');
    err.code = 'BAD_REQUEST';
    throw err;
  }
  const lastUser = messages[messages.length - 1];
  if (lastUser.role !== 'user') {
    const err = new Error('El último mensaje debe tener role="user".');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  // BYOK Groq: key del cliente, fallback a la de plataforma durante trial, o 402.
  const { apiKey } = await resolveGroqKey({ restaurantId });

  const contextBlock = await buildContextBlock({ restaurantId, locationId });

  const groq = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });

  // Convertimos el historial al formato OpenAI. La UI envía bloques tipo
  // Anthropic ([{type:'text', text:'...'}]) o strings; los aplanamos a string
  // porque Groq/llama no soporta input estructurado tipo Anthropic.
  const chatMessages = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n${contextBlock}` },
  ];
  for (const m of messages) {
    const text = toText(m.content);
    if (!text) continue;
    chatMessages.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: text,
    });
  }

  const toolsUsed = [];
  let finalText = '';
  let usage = null;

  try {
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: chatMessages,
        tools,
        tool_choice: 'auto',
        temperature: 0.4,
        max_tokens: 1024,
      });

      usage = completion.usage || usage;
      const choice = completion.choices?.[0];
      const msg = choice?.message;
      if (!msg) {
        finalText = 'No recibí respuesta del modelo.';
        break;
      }

      const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

      if (toolCalls.length === 0) {
        finalText = msg.content || '';
        break;
      }

      // Persistimos el turno del asistente con sus tool_calls para el siguiente
      // round-trip; Groq lo exige tal cual viene del modelo.
      chatMessages.push({
        role: 'assistant',
        content: msg.content || '',
        tool_calls: toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.function.name, arguments: c.function.arguments },
        })),
      });

      for (const call of toolCalls) {
        const name = call.function?.name;
        toolsUsed.push(name);
        let args = {};
        try {
          args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          args = {};
        }
        let payload;
        try {
          payload = await execTool(name, args, { restaurantId, locationId });
        } catch (err) {
          payload = { error: err.message };
        }
        chatMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(payload),
        });
      }
    }
  } catch (err) {
    throw wrapGroqError(err);
  }

  if (!finalText) finalText = 'Se alcanzó el límite de iteraciones del asistente.';

  // Devolver el historial completo en el formato que espera la UI (bloques
  // tipo Anthropic) — texto + nombres de herramientas usadas.
  const assistantContent = [{ type: 'text', text: finalText }];
  for (const name of toolsUsed) assistantContent.push({ type: 'tool_use', name });

  return {
    messages: [...messages, { role: 'assistant', content: assistantContent }],
    toolsUsed,
    usage,
  };
}

module.exports = { runAssistant };
