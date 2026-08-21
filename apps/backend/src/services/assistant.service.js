// Asistente administrativo del dashboard, migrado de Gemini a Groq Cloud.
// Usa el SDK oficial de OpenAI apuntando a Groq (baseURL https://api.groq.com/openai/v1)
// con el modelo llama-3.1-8b-instant. Expone runAssistant({ messages, restaurantId, locationId })
// con 4 herramientas read-only (function calling) que consultan Prisma scoped por restaurante
// y, cuando aplica, por sucursal.

const OpenAI = require('openai');
const { prisma } = require('@mrtpvrest/database');
const { resolveGroqKey } = require('./ai-key.service');
const { GROQ_BASE_URL, GROQ_MODEL, wrapGroqError } = require('./groq-error');
const { localDayRange } = require('../utils/dayRange');

const MAX_ITERATIONS = 6;

const SYSTEM_PROMPT = `Eres el asistente administrativo de MRTPVREST, un SaaS de gestión de restaurantes.
Ayudas al dueño/gerente a entender su operación respondiendo en español neutro, con cifras concretas.

Reglas:
- Usa SIEMPRE las herramientas para obtener datos actualizados antes de responder preguntas sobre ventas, productos, inventario, personal o caja de repartidores. Nunca inventes cifras.
- Para preguntas sobre el conteo, corte o caja de un repartidor (p. ej. "revísame a Pablo de hoy"), usa get_driver_cash_report. El saldo pendiente de corte es el efectivo que el repartidor debe entregar en caja; distínguelo de los pedidos aún sin cobrar.
- Para ver qué productos están bajando o subiendo en ventas (tendencias), usa get_product_trends.
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
      name: 'get_product_trends',
      description: 'Compara las ventas de productos entre el periodo actual y el periodo anterior equivalente (ej. últimos 30 días vs los 30 previos). Úsalo para responder qué productos están bajando o subiendo en ventas.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['7D', '30D', '90D', 'AÑO'],
            description: 'Periodo base para la comparación.',
          },
          sortBy: {
            type: 'string',
            enum: ['DROPPING', 'RISING'],
            description: 'DROPPING para ver los que más bajaron (ej. qué está bajando en ventas), RISING para los que más subieron.',
          },
          limit: {
            type: 'integer',
            description: 'Cantidad de productos a devolver.',
          }
        },
        required: ['period', 'sortBy'],
        additionalProperties: false,
      },
    },
  },
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
            enum: ['HOY', '7D', '30D', '90D', 'AÑO', 'HIST'],
            description: 'HOY = hoy, 7D = últimos 7 días, 30D = últimos 30 días, 90D = últimos 90 días, AÑO = año en curso, HIST = todo el historial.',
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
            enum: ['HOY', '7D', '30D', '90D', 'AÑO', 'HIST'],
            description: 'HOY = hoy, 7D = últimos 7 días, 30D = últimos 30 días, 90D = últimos 90 días, AÑO = año en curso, HIST = todo el historial.',
          },
          limit: {
            type: ['integer', 'null'],
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
  {
    type: 'function',
    function: {
      name: 'get_driver_cash_report',
      description: 'Reporte de caja/corte de un repartidor (DELIVERY) para un día: saldo PENDIENTE DE CORTE (efectivo que debe entregar en caja), pedidos del día con método de pago y estado, totales cobrados vs pendientes, y desglose de envíos por zona. Úsalo para preguntas tipo "revísame el conteo/corte/caja del repartidor X". Si no se indica driverName, devuelve solo el saldo pendiente de todos los repartidores.',
      parameters: {
        type: 'object',
        properties: {
          driverName: {
            type: ['string', 'null'],
            description: 'Nombre o parte del nombre del repartidor (p. ej. "Pablo"). Omitir para ver a todos los repartidores.',
          },
          date: {
            type: ['string', 'null'],
            description: 'Fecha en formato YYYY-MM-DD (día natural, hora de México). Omitir para usar el día de hoy.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customers',
      description: 'Busca clientes del restaurante o lista los más frecuentes. Devuelve nombre, teléfono, total gastado y cantidad de pedidos.',
      parameters: {
        type: 'object',
        properties: {
          searchTerm: {
            type: ['string', 'null'],
            description: 'Nombre o teléfono parcial a buscar. Omitir para ver los clientes más frecuentes.',
          },
          limit: {
            type: ['integer', 'null'],
            description: 'Cantidad de clientes a devolver (1-50, por defecto 10).',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_orders_detail',
      description: 'Devuelve el detalle de los pedidos recientes. Permite filtrar por estado (PENDING, CONFIRMED, PREPARING, READY, ON_THE_WAY, DELIVERED, CANCELLED) o ver los últimos N pedidos.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['HOY', '7D', '30D', '90D', 'AÑO', 'HIST'],
            description: 'Filtro de fecha.',
          },
          status: {
            type: ['string', 'null'],
            enum: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'ON_THE_WAY', 'DELIVERED', 'CANCELLED', null],
            description: 'Estado del pedido para filtrar. Omitir para todos.',
          },
          limit: {
            type: ['integer', 'null'],
            description: 'Cantidad de pedidos a devolver (1-50, por defecto 10).',
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
      name: 'get_full_inventory',
      description: 'Devuelve el inventario completo de la sucursal activa, incluyendo existencias actuales, precio de costo y stock mínimo.',
      parameters: {
        type: 'object',
        properties: {
          searchTerm: {
            type: ['string', 'null'],
            description: 'Nombre del ingrediente a buscar. Omitir para listar todos.',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_financial_expenses',
      description: 'Devuelve los gastos operativos registrados en la sucursal activa para el período indicado. Útil para consultar sueldos, luz, agua, insumos pagados por caja, etc.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['HOY', '7D', '30D', '90D', 'AÑO', 'HIST'],
            description: 'Filtro de fecha.',
          },
        },
        required: ['period'],
        additionalProperties: false,
      },
    },
  },
];

// Categorías de "envío" del restaurante (Envíos/Domicilio/Flete/Reparto…),
// para clasificar las líneas de envío sin depender del nombre del producto.
async function shippingCategoryIds(restaurantId) {
  if (!restaurantId) return new Set();
  const cats = await prisma.category.findMany({
    where: {
      restaurantId,
      OR: [
        { name: { contains: 'nvio', mode: 'insensitive' } },
        { name: { contains: 'nvío', mode: 'insensitive' } },
        { name: { contains: 'omicilio', mode: 'insensitive' } },
        { name: { contains: 'lete', mode: 'insensitive' } },
        { name: { contains: 'eparto', mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  return new Set(cats.map((c) => c.id));
}

function periodRange(period) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const p = String(period || 'HOY').toUpperCase();
  if (p === '7D') from.setDate(from.getDate() - 6);
  else if (p === '30D') from.setDate(from.getDate() - 29);
  else if (p === '90D') from.setDate(from.getDate() - 89);
  else if (p === 'AÑO' || p === 'ANIO' || p === 'ANO') from.setMonth(0, 1);
  else if (p === 'HIST') return new Date(0); // Desde el principio de los tiempos
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

  if (name === 'get_product_trends') {
    const period = String(args.period || '30D').toUpperCase();
    const now = new Date();
    const currentFrom = new Date();
    currentFrom.setHours(0, 0, 0, 0);
    
    let previousFrom = new Date();
    previousFrom.setHours(0, 0, 0, 0);
    let previousTo = new Date(currentFrom);
    
    if (period === '7D') {
      currentFrom.setDate(currentFrom.getDate() - 6);
      previousFrom.setDate(currentFrom.getDate() - 7);
      previousTo = new Date(currentFrom);
    } else if (period === '30D') {
      currentFrom.setDate(currentFrom.getDate() - 29);
      previousFrom.setDate(currentFrom.getDate() - 30);
      previousTo = new Date(currentFrom);
    } else if (period === '90D') {
      currentFrom.setDate(currentFrom.getDate() - 89);
      previousFrom.setDate(currentFrom.getDate() - 90);
      previousTo = new Date(currentFrom);
    } else if (period === 'AÑO' || period === 'ANIO' || period === 'ANO') {
      currentFrom.setMonth(0, 1);
      previousFrom.setFullYear(previousFrom.getFullYear() - 1);
      previousFrom.setMonth(0, 1);
      previousTo = new Date(currentFrom);
    }

    const limit = Math.min(Math.max(parseInt(args.limit) || 10, 1), 30);
    const sortBy = args.sortBy === 'RISING' ? 'RISING' : 'DROPPING';

    const currentItems = await prisma.orderItem.groupBy({
      by: ['name'],
      where: {
        order: {
          restaurantId,
          status: { not: 'CANCELLED' },
          createdAt: { gte: currentFrom },
          ...(locationId ? { locationId } : {}),
        },
      },
      _sum: { quantity: true, subtotal: true },
    });

    const previousItems = await prisma.orderItem.groupBy({
      by: ['name'],
      where: {
        order: {
          restaurantId,
          status: { not: 'CANCELLED' },
          createdAt: { gte: previousFrom, lt: previousTo },
          ...(locationId ? { locationId } : {}),
        },
      },
      _sum: { quantity: true, subtotal: true },
    });

    const nameSet = new Set([...currentItems.map(i=>i.name), ...previousItems.map(i=>i.name)]);
    const currMap = {};
    const currTotalMap = {};
    currentItems.forEach(i => { currMap[i.name] = i._sum.quantity || 0; currTotalMap[i.name] = Math.round(i._sum.subtotal || 0); });
    const prevMap = {};
    previousItems.forEach(i => { prevMap[i.name] = i._sum.quantity || 0; });

    let trends = Array.from(nameSet).map(name => {
      const currQty = currMap[name] || 0;
      const prevQty = prevMap[name] || 0;
      const diff = currQty - prevQty;
      const percent = prevQty === 0 ? (currQty > 0 ? 100 : 0) : Math.round((diff / prevQty) * 100);
      return {
        name,
        currentQuantity: currQty,
        previousQuantity: prevQty,
        difference: diff,
        percentChange: percent,
        currentTotal: currTotalMap[name] || 0
      };
    });
    
    if (sortBy === 'DROPPING') {
      trends.sort((a, b) => a.difference - b.difference);
    } else {
      trends.sort((a, b) => b.difference - a.difference);
    }
    
    return trends.slice(0, limit);
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

  if (name === 'get_driver_cash_report') {
    const { from, to } = localDayRange(args.date);
    const wantName = (args.driverName || '').trim();

    const drivers = await prisma.employee.findMany({
      where: {
        role: 'DELIVERY',
        isActive: true,
        ...(restaurantId ? { location: { restaurantId } } : {}),
        ...(wantName ? { name: { contains: wantName, mode: 'insensitive' } } : {}),
      },
      select: { id: true, name: true },
    });
    if (drivers.length === 0) {
      return { error: wantName ? `No encontré ningún repartidor que coincida con "${wantName}".` : 'No hay repartidores activos.' };
    }

    // Sin nombre: vista panorámica — solo saldo pendiente de corte por repartidor.
    if (!wantName) {
      const ids = drivers.map((d) => d.id);
      const movs = await prisma.driverCashMovement.findMany({ where: { driverId: { in: ids }, approved: false } });
      return drivers.map((d) => {
        const dm = movs.filter((m) => m.driverId === d.id);
        const bal = dm.reduce((s, m) => s + (m.type === 'FLOAT' || m.type === 'INCOME' ? m.amount : -m.amount), 0);
        return { driver: d.name, pendingBalance: Math.round(bal), pendingMovements: dm.length };
      });
    }

    // Con nombre: reporte detallado (normalmente 1 repartidor; si hay varios
    // homónimos, se reporta cada uno).
    const shipCats = await shippingCategoryIds(restaurantId);
    const reports = [];
    for (const d of drivers) {
      const [orders, pending, cuts] = await Promise.all([
        prisma.order.findMany({
          where: { deliveryDriverId: d.id, createdAt: { gte: from, lte: to }, ...(restaurantId ? { restaurantId } : {}) },
          orderBy: { createdAt: 'asc' },
          select: {
            orderNumber: true, status: true, paymentMethod: true, paymentStatus: true, total: true,
            customerName: true, ticketName: true,
            items: { select: { name: true, quantity: true, price: true, subtotal: true, menuItem: { select: { categoryId: true } } } },
          },
        }),
        prisma.driverCashMovement.findMany({ where: { driverId: d.id, approved: false } }),
        prisma.driverCashCut.findMany({ where: { driverId: d.id, createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'desc' }, take: 1 }),
      ]);

      const income = pending.filter((m) => m.type === 'INCOME').reduce((s, m) => s + m.amount, 0);
      const float = pending.filter((m) => m.type === 'FLOAT').reduce((s, m) => s + m.amount, 0);
      const expense = pending.filter((m) => m.type === 'EXPENSE').reduce((s, m) => s + m.amount, 0);
      const returned = pending.filter((m) => m.type === 'RETURN').reduce((s, m) => s + m.amount, 0);

      const byMethod = {};
      let paid = 0, unpaid = 0, shippingTotal = 0;
      const ordersOut = orders.map((o) => {
        const m = o.paymentMethod || 'OTHER';
        byMethod[m] = (byMethod[m] || 0) + (o.total || 0);
        if (o.paymentStatus === 'PAID') paid += o.total || 0; else unpaid += o.total || 0;
        let ship = 0;
        for (const it of o.items) {
          if (it.menuItem && shipCats.has(it.menuItem.categoryId)) {
            ship += (typeof it.subtotal === 'number' && it.subtotal > 0) ? it.subtotal : (it.price || 0) * (it.quantity || 0);
          }
        }
        shippingTotal += ship;
        return { orderNumber: o.orderNumber, customer: o.customerName || o.ticketName || null, method: o.paymentMethod, paymentStatus: o.paymentStatus, status: o.status, total: o.total || 0, shipping: ship };
      });

      reports.push({
        driver: d.name,
        date: args.date || 'hoy',
        cashPendingToCut: {
          balance: Math.round(float + income - expense - returned),
          income: Math.round(income), float: Math.round(float), expense: Math.round(expense), returned: Math.round(returned),
          movements: pending.length,
        },
        alreadyCutToday: cuts[0] ? { balance: Math.round(cuts[0].balance), movements: cuts[0].movements } : null,
        ordersSummary: {
          count: ordersOut.length,
          total: Math.round(ordersOut.reduce((s, o) => s + o.total, 0)),
          paid: Math.round(paid), pending: Math.round(unpaid),
          byMethod, shippingTotal: Math.round(shippingTotal),
        },
        orders: ordersOut.slice(0, 25),
      });
    }
    return reports.length === 1 ? reports[0] : reports;
  }

  if (name === 'get_customers') {
    const limit = Math.min(Math.max(parseInt(args.limit) || 10, 1), 50);
    const searchTerm = (args.searchTerm || '').trim();
    const whereClause = { restaurantId };
    if (searchTerm) {
      whereClause.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { phone: { contains: searchTerm } }
      ];
    }
    const customers = await prisma.customer.findMany({
      where: whereClause,
      orderBy: { totalSpent: 'desc' },
      take: limit,
      select: { name: true, phone: true, ordersCount: true, totalSpent: true, lastOrderAt: true }
    });
    return customers.map(c => ({
      name: c.name || 'Sin nombre',
      phone: c.phone,
      ordersCount: c.ordersCount,
      totalSpent: Math.round(c.totalSpent),
      lastOrderAt: c.lastOrderAt
    }));
  }

  if (name === 'get_orders_detail') {
    const from = periodRange(args.period);
    const limit = Math.min(Math.max(parseInt(args.limit) || 10, 1), 50);
    const whereClause = {
      restaurantId,
      createdAt: { gte: from },
      ...(locationId ? { locationId } : {}),
    };
    if (args.status) {
      whereClause.status = args.status;
    }
    const orders = await prisma.order.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        orderNumber: true, status: true, total: true, createdAt: true,
        customerName: true, ticketName: true, paymentMethod: true,
        items: { select: { name: true, quantity: true } }
      }
    });
    return orders.map(o => ({
      orderNumber: o.orderNumber,
      status: o.status,
      customer: o.customerName || o.ticketName || 'Desconocido',
      total: Math.round(o.total || 0),
      paymentMethod: o.paymentMethod || 'OTHER',
      date: o.createdAt,
      items: o.items.map(i => `${i.quantity}x ${i.name}`)
    }));
  }

  if (name === 'get_full_inventory') {
    if (!locationId) return { error: 'Sin sucursal activa. Pide al usuario que seleccione una.' };
    const searchTerm = (args.searchTerm || '').trim();
    const whereClause = { locationId };
    if (searchTerm) {
      whereClause.name = { contains: searchTerm, mode: 'insensitive' };
    }
    const items = await prisma.ingredient.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
      take: 100,
      select: { name: true, unit: true, stock: true, minStock: true, costPrice: true }
    });
    return items.map(i => ({
      name: i.name,
      stock: i.stock,
      unit: i.unit,
      minStock: i.minStock,
      costPrice: i.costPrice
    }));
  }

  if (name === 'get_financial_expenses') {
    if (!locationId) return { error: 'Sin sucursal activa. Pide al usuario que seleccione una.' };
    const from = periodRange(args.period);
    const expenses = await prisma.operatingExpense.findMany({
      where: { locationId, occurredAt: { gte: from } },
      orderBy: { occurredAt: 'desc' },
      select: { concept: true, amount: true, occurredAt: true, category: { select: { name: true } } },
      take: 50
    });
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    return {
      period: args.period,
      totalExpenses: Math.round(total),
      expenses: expenses.map(e => ({
        description: e.concept,
        amount: e.amount,
        category: e.category?.name || 'General',
        date: e.occurredAt
      }))
    };
  }

  return { error: `Herramienta desconocida: ${name}` };
}

async function buildContextBlock({ restaurantId, locationId, period }) {
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
    `- Período seleccionado en la interfaz: ${period || 'HOY'} (¡IMPORTANTE! Debes usar este periodo por defecto al llamar a tus herramientas si el usuario no especifica uno distinto en su mensaje).`,
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

async function runAssistant({ messages, restaurantId, locationId, period }) {
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

  const contextBlock = await buildContextBlock({ restaurantId, locationId, period });

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
