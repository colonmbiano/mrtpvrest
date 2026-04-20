// Asistente administrativo para el dashboard, basado en Gemini Flash (gratuito
// dentro de la cuota). Expone runAssistant({ messages, restaurantId, locationId })
// con 4 herramientas read-only (function calling) que consultan Prisma scoped.

const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const { prisma } = require('@mrtpvrest/database');
const { resolveAiKey } = require('./ai-key.service');

const MODEL = 'gemini-flash-latest';
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

const functionDeclarations = [
  {
    name: 'get_sales_summary',
    description: 'Devuelve ingresos totales, número de pedidos y ticket promedio del período indicado, para el restaurante actual. Excluye pedidos cancelados.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        period: {
          type: SchemaType.STRING,
          enum: ['HOY', '7D', '30D', 'AÑO'],
          description: 'HOY = hoy, 7D = últimos 7 días, 30D = últimos 30 días, AÑO = año en curso.',
        },
      },
      required: ['period'],
    },
  },
  {
    name: 'get_top_products',
    description: 'Lista los productos más vendidos en el período, ordenados por cantidad descendente. Devuelve nombre, cantidad vendida y monto total.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        period: {
          type: SchemaType.STRING,
          enum: ['HOY', '7D', '30D', 'AÑO'],
          description: 'Período a consultar.',
        },
        limit: {
          type: SchemaType.INTEGER,
          description: 'Cantidad de productos a devolver (1–20, por defecto 5).',
        },
      },
      required: ['period'],
    },
  },
  {
    name: 'get_inventory_alerts',
    description: 'Lista ingredientes de la sucursal activa cuyo stock está en o por debajo del stock mínimo. Devuelve nombre, unidad, stock actual y stock mínimo. Requiere sucursal activa.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'get_active_staff',
    description: 'Lista empleados con turno activo (EmployeeShift abierto) en la sucursal activa: nombre, rol, mesas y hora de inicio. Requiere sucursal activa.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
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

  // BYOK: key del cliente, o de la plataforma durante trial, o 402.
  const { apiKey } = await resolveAiKey({ restaurantId });

  const contextBlock = await buildContextBlock({ restaurantId, locationId });

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: `${SYSTEM_PROMPT}\n\n${contextBlock}`,
    tools: [{ functionDeclarations }],
  });

  // Traducir historial al formato de Gemini (solo turnos previos — el último
  // mensaje del usuario se envía con sendMessage).
  const history = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const m = messages[i];
    const text = toText(m.content);
    if (!text) continue;
    history.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text }],
    });
  }

  const chat = model.startChat({ history });

  const userText = toText(lastUser.content);
  let next = userText;
  const toolsUsed = [];
  let finalText = '';
  let usage = null;

  try {
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const result = await chat.sendMessage(next);
      const response = result.response;
      usage = response.usageMetadata || usage;
      const calls = typeof response.functionCalls === 'function' ? response.functionCalls() : null;

      if (!calls || calls.length === 0) {
        finalText = response.text() || '';
        break;
      }

      const parts = [];
      for (const call of calls) {
        toolsUsed.push(call.name);
        let payload;
        try {
          payload = await execTool(call.name, call.args || {}, { restaurantId, locationId });
        } catch (err) {
          payload = { error: err.message };
        }
        parts.push({
          functionResponse: {
            name: call.name,
            response: { result: payload },
          },
        });
      }
      next = parts;
    }
  } catch (err) {
    const wrapped = new Error(err.message || 'Error al consultar Gemini');
    wrapped.code = 'UPSTREAM';
    wrapped.status = err.status || 500;
    throw wrapped;
  }

  if (!finalText) finalText = 'Se alcanzó el límite de iteraciones del asistente.';

  // Devolver el historial completo en el mismo formato del frontend
  // (bloques tipo Anthropic) para que la UI pueda mostrar texto + pipeline.
  const assistantContent = [{ type: 'text', text: finalText }];
  for (const name of toolsUsed) assistantContent.push({ type: 'tool_use', name });

  return {
    messages: [...messages, { role: 'assistant', content: assistantContent }],
    toolsUsed,
    usage,
  };
}

module.exports = { runAssistant };
