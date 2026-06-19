require('dotenv').config();

// ─────────────────────────────────────────────────────────────────────────
// expandSubRecipeToIngredients · devuelve los ingredientes finales (hojas)
// que se consumen al usar `qtyRequested` unidades de una SubRecipe.
//
// Ejemplo: SubRecipe "Salsa Verde" rinde 800g, con marginError 5%, e items:
//   - tomate    400g
//   - cebolla   100g
// Si una Recipe pide 100g de Salsa Verde:
//   factor = 100 / 800 = 0.125
//   adjMargen = 0.125 / (1 - 0.05) = 0.131578... (necesitas preparar 5% extra
//   de bruto para obtener 100g netos tras la pérdida)
//   tomate consumido  = 0.131578 × 400 = 52.63g
//   cebolla consumida = 0.131578 × 100 = 13.16g
//
// Recursivo: si un SubRecipeItem apunta a otra SubRecipe (nested), aplica
// el mismo cálculo en cadena. `visited` previene loops; `depth` cap defensivo.
async function expandSubRecipeToIngredients(prisma, subRecipeId, qtyRequested, visited = new Set(), depth = 0) {
  if (depth > 5) {
    console.warn(`[expandSubRecipe] profundidad ${depth} excedida en ${subRecipeId}`);
    return [];
  }
  if (visited.has(subRecipeId)) {
    console.warn(`[expandSubRecipe] loop detectado en ${subRecipeId}, saltando`);
    return [];
  }
  visited.add(subRecipeId);

  const sub = await prisma.subRecipe.findUnique({
    where: { id: subRecipeId },
    include: { items: { include: { ingredient: true } } },
  });
  if (!sub || !sub.items || sub.items.length === 0) return [];

  const yieldQty = Number(sub.yieldQty || 0);
  if (yieldQty <= 0) return [];
  const marginPct = Number(sub.marginErrorPct || 0);
  const adjustedFactor = qtyRequested / yieldQty / Math.max(0.001, 1 - marginPct / 100);

  const out = [];
  for (const item of sub.items) {
    const itemQty = Number(item.qty || 0) * adjustedFactor;
    if (item.ingredientId && item.ingredient) {
      out.push({ ingredient: item.ingredient, qtyToConsume: itemQty });
    } else if (item.nestedSubRecipeId) {
      const nested = await expandSubRecipeToIngredients(
        prisma, item.nestedSubRecipeId, itemQty, new Set(visited), depth + 1,
      );
      out.push(...nested);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// discountInventory · descuenta ingredientes consumidos por una orden y
// persiste el snapshot de costo (CMV) en cada OrderItem.
//
// Cambios vs versión legacy:
//   1. Lee `Recipe` (escandallo final) cuando existe, con fallback a la
//      vieja `RecipeItem.menuItemId` directa para items sin Recipe formal.
//   2. Crea `StockMovement` con balanceAfter cacheado + refType='order'.
//   3. Solo escribe en `StockMovement`. El antiguo `InventoryMovement` ya
//      fue retirado tras migrar todos los consumidores (voice-agent +
//      /api/inventory/movements ahora también usan StockMovement).
//   4. Actualiza `OrderItem.costSnapshot` con el CMV unitario al cobrar
//      (snapshot inmutable — reportes históricos no recalculan).
//   5. Expansión recursiva de SubRecipe: si un RecipeItem apunta a una
//      SubRecipe, se calcula el consumo proporcional de cada ingrediente
//      hoja (incluyendo nested SubRecipes hasta profundidad 5).
async function discountInventory(prisma, orderItems, orderId, restaurantId, locationId) {
  if (!Array.isArray(orderItems) || orderItems.length === 0) return;
  if (!locationId) {
    console.warn('[discountInventory] locationId requerido; abortando descuento');
    return;
  }

  try {
    for (const oi of orderItems) {
      // Resolver la receta del platillo. Un platillo puede tener:
      //   - una receta base (variantId NULL), y/o
      //   - recetas por variante (p.ej. Alambre 350gr Arrachera/Pollo/Res-Cerdo).
      // order_items NO guarda variantId; la variante viene embebida en oi.name
      // como "Platillo (Variante)". Elegimos la receta de la variante vendida
      // y, si no hay match, caemos a la receta base.
      const recipes = await prisma.recipe.findMany({
        where: { menuItemId: oi.menuItemId, restaurantId, isActive: true },
        select: { id: true, variantId: true, variant: { select: { name: true } } },
      });

      let chosenRecipeId = null;
      if (recipes.length > 0) {
        const variantRecipes = recipes.filter((r) => r.variantId && r.variant);
        if (variantRecipes.length > 0) {
          const nm = (oi.name || '').toLowerCase();
          const match = variantRecipes.find((r) => nm.includes(r.variant.name.toLowerCase()));
          const base = recipes.find((r) => !r.variantId);
          chosenRecipeId = (match || base || recipes[0]).id;
        } else {
          chosenRecipeId = recipes[0].id; // solo receta base
        }
      }

      // RecipeItems de la receta elegida; si el platillo no tiene Recipe formal,
      // fallback a la forma legacy (RecipeItem.menuItemId directo).
      const recipeItems = await prisma.recipeItem.findMany({
        where: chosenRecipeId
          ? { recipeId: chosenRecipeId }
          : { menuItemId: oi.menuItemId, menuItem: { restaurantId } },
        include: { ingredient: true, recipe: true },
      });

      // Lista plana de ingredientes a consumir POR UNIDAD del MenuItem.
      // [{ ingredient, qtyToConsumePerUnit }]
      const flatItems = [];
      let recipeIdSnap = null;

      for (const r of recipeItems) {
        if (r.recipeId && !recipeIdSnap) recipeIdSnap = r.recipeId;

        const wastageFactor = 1 + (Number(r.wastagePercent || 0) / 100);
        const qtyPerUnit = Number(r.quantity) * wastageFactor;

        if (r.ingredientId && r.ingredient) {
          // Ingrediente directo
          flatItems.push({ ingredient: r.ingredient, qtyToConsumePerUnit: qtyPerUnit });
        } else if (r.subRecipeId) {
          // Expansión recursiva de SubRecipe
          const expanded = await expandSubRecipeToIngredients(prisma, r.subRecipeId, qtyPerUnit);
          for (const exp of expanded) {
            flatItems.push({ ingredient: exp.ingredient, qtyToConsumePerUnit: exp.qtyToConsume });
          }
        }
      }

      // Consumo por MODIFICADORES (extras): cada modificador de la línea puede
      // consumir insumos (Papas Gajo Extra → 150g papa, etc.). Se mapea por
      // NOMBRE a nivel restaurante (order_item_modifiers guarda el nombre). El
      // extra aplica por unidad del platillo, igual que la receta.
      const oiModifiers = await prisma.orderItemModifier.findMany({
        where: { orderItemId: oi.id },
        select: { name: true },
      });
      if (oiModifiers.length > 0) {
        const names = [...new Set(oiModifiers.map((m) => m.name))];
        const modMaps = await prisma.modifierIngredient.findMany({
          where: { restaurantId, name: { in: names } },
          include: { ingredient: true },
        });
        const byName = new Map();
        for (const mm of modMaps) {
          if (!byName.has(mm.name)) byName.set(mm.name, []);
          byName.get(mm.name).push(mm);
        }
        for (const om of oiModifiers) {
          const maps = byName.get(om.name) || [];
          for (const mm of maps) {
            const wf = 1 + (Number(mm.wastagePercent || 0) / 100);
            const q = Number(mm.quantity) * wf;
            if (mm.ingredientId && mm.ingredient) {
              flatItems.push({ ingredient: mm.ingredient, qtyToConsumePerUnit: q });
            } else if (mm.subRecipeId) {
              const expanded = await expandSubRecipeToIngredients(prisma, mm.subRecipeId, q);
              for (const exp of expanded) {
                flatItems.push({ ingredient: exp.ingredient, qtyToConsumePerUnit: exp.qtyToConsume });
              }
            }
          }
        }
      }

      if (flatItems.length === 0) continue;

      // Si dos paths (ingrediente directo + sub-receta) consumen el mismo
      // ingrediente, agregamos las cantidades en una sola operación de
      // descuento — evita race / multiple StockMovements del mismo ingrediente.
      const aggregated = new Map(); // ingredientId → { ingredient, qtyPerUnit }
      for (const fi of flatItems) {
        const id = fi.ingredient.id;
        const existing = aggregated.get(id);
        if (existing) {
          existing.qtyPerUnit += fi.qtyToConsumePerUnit;
        } else {
          aggregated.set(id, { ingredient: fi.ingredient, qtyPerUnit: fi.qtyToConsumePerUnit });
        }
      }

      let cmvUnitario = 0;

      // Multiplicador del consumo: para productos por peso, la receta está
      // definida POR KG, así que se descuenta proporcional a los kg vendidos
      // (weightKg). Para productos por pieza, por unidades (quantity).
      const consumptionMultiplier = oi.weightKg != null
        ? Number(oi.weightKg)
        : Number(oi.quantity || 1);

      for (const [, { ingredient, qtyPerUnit }] of aggregated) {
        const needed = qtyPerUnit * consumptionMultiplier;
        const unitCost = Number(ingredient.cost || 0);
        cmvUnitario += qtyPerUnit * unitCost; // CMV por 1 unidad del MenuItem

        // 1. Decremento de stock + lectura del nuevo balance.
        const updated = await prisma.ingredient.update({
          where: { id: ingredient.id },
          data: { stock: { decrement: needed } },
          select: { id: true, stock: true, baseUnit: true, locationId: true },
        });

        // 2. StockMovement.
        const ingLocationId = updated.locationId || locationId;
        await prisma.stockMovement.create({
          data: {
            ingredientId: ingredient.id,
            locationId: ingLocationId,
            delta: -needed,
            unit: updated.baseUnit,
            reason: 'SALE',
            refType: 'order',
            refId: orderId,
            balanceAfter: Number(updated.stock),
            unitCostAtMove: unitCost,
            notes: `Venta orderItem ${oi.id}`,
          },
        });

      }

      // 4. Snapshot de costo en el OrderItem. Inmutable.
      if (cmvUnitario > 0 || recipeIdSnap) {
        await prisma.orderItem.update({
          where: { id: oi.id },
          data: {
            costSnapshot: Number(cmvUnitario.toFixed(4)),
            recipeIdSnap,
          },
        });
      }
    }
  } catch (e) {
    console.error('Error descontando inventario:', e.message, e.stack);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// restoreInventoryForCancelledOrder · revierte el stock descontado por una
// orden al cancelarla. No recalcula recetas (pueden haber cambiado desde la
// venta): repone exactamente lo que registran los StockMovements SALE de la
// orden, neteado contra reversiones previas (ADJUSTMENT con el mismo ref)
// para que reintentos o dobles llamadas no dupliquen la reposición.
//
// Órdenes que nunca descontaron inventario (web/kiosko/storefront, o items
// sin receta) no tienen movimientos SALE → no-op. La reversión usa reason
// ADJUSTMENT porque el enum no tiene un valor de cancelación; el refType
// 'order' + notes dejan el rastro auditable.
async function restoreInventoryForCancelledOrder(prisma, orderId) {
  const movements = await prisma.stockMovement.findMany({
    where: { refType: 'order', refId: orderId, reason: { in: ['SALE', 'ADJUSTMENT'] } },
    select: { ingredientId: true, delta: true },
  });
  if (movements.length === 0) return;

  // Neto por ingrediente: SALE aporta negativo, reversiones previas positivo.
  const netByIngredient = new Map();
  for (const m of movements) {
    netByIngredient.set(m.ingredientId, (netByIngredient.get(m.ingredientId) || 0) + Number(m.delta || 0));
  }

  for (const [ingredientId, net] of netByIngredient) {
    if (net >= 0) continue; // nada pendiente de reponer
    const toRestore = -net;

    await prisma.$transaction(async (tx) => {
      const updated = await tx.ingredient.update({
        where: { id: ingredientId },
        data: { stock: { increment: toRestore } },
        select: { id: true, stock: true, baseUnit: true, locationId: true },
      });
      await tx.stockMovement.create({
        data: {
          ingredientId,
          locationId: updated.locationId,
          delta: toRestore,
          unit: updated.baseUnit,
          reason: 'ADJUSTMENT',
          refType: 'order',
          refId: orderId,
          balanceAfter: Number(updated.stock),
          notes: 'Reversión por cancelación de orden',
        },
      });
    });
  }
}

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { normalizePhone } = require('@mrtpvrest/config/phone');
const { authenticate, requireAdmin, requireTenantAccess, requireRole, requirePermission, userHasPermission, hasValidOverride } = require('../middleware/auth.middleware');
const { requireActiveShift } = require('../middleware/shift.middleware');
const { validateBody } = require('../lib/validate');
const { resolveVariantSelection, applyFreeModifiers, computeOrderTotals } = require('../lib/money');
const { nextOrderNumber } = require('../lib/order-number');
const { releaseTableAfterPayment } = require('../services/table-lifecycle.service');
const audit = require('../lib/audit-logger');
const {
  createOrderSchema,
  addItemsSchema,
  updateStatusSchema,
  updatePaymentSchema,
  messageSchema,
} = require('../schemas/orders.schema');
const router = express.Router();

// Estados en los que una cuenta de mesa DINE_IN sigue "abierta" (con saldo por
// cobrar). OJO: una cuenta abierta NO se queda en 'OPEN' — cocina la avanza a
// CONFIRMED/PREPARING/READY sin que esté pagada. Filtrar solo por 'OPEN'
// rompía de dos formas: (a) duplicaba cuentas (la mesa "ocupada" no se
// detectaba al re-entrar) y (b) hacía inconsistente la fusión por tableId.
// Este set + paymentStatus != PAID es la definición canónica de "mesa con
// cuenta abierta" y debe usarse en TODO lookup de cuenta-por-mesa.
const OPEN_TABLE_STATUSES = ['OPEN', 'CONFIRMED', 'PREPARING', 'READY'];

function extractIds(value, key) {
  return Array.isArray(value)
    ? value.map((entry) => entry?.[key]).filter(Boolean)
    : [];
}

// Resuelve el peso (kg) de una línea vendida por báscula. Devuelve el peso
// redondeado a 3 decimales SOLO si el producto es soldByWeight y el cliente
// mandó un peso > 0; en cualquier otro caso null (producto por pieza). El
// servidor es quien decide: un weightKg en el payload de un producto normal
// se ignora, igual que el precio nunca se confía del cliente.
function resolveWeightKg(menuItem, rawWeightKg) {
  if (!menuItem || menuItem.soldByWeight !== true) return null;
  const w = Number(rawWeightKg);
  if (!Number.isFinite(w) || w <= 0) return null;
  return Math.round(w * 1000) / 1000;
}

function appendComplementNotes(notes, complements) {
  const base = typeof notes === 'string' ? notes.trim() : '';
  if (!Array.isArray(complements) || complements.length === 0) return base || null;
  const names = complements.map((c) => c.name).filter(Boolean).join(', ');
  if (!names) return base || null;
  return [base, `Complementos: ${names}`].filter(Boolean).join('\n');
}

function appendVariantNotes(notes, variants) {
  const base = typeof notes === 'string' ? notes.trim() : '';
  if (!Array.isArray(variants) || variants.length === 0) return base || null;
  const names = variants.map((v) => v.name).filter(Boolean).join(', ');
  if (!names) return base || null;
  return [base, `Variantes: ${names}`].filter(Boolean).join('\n');
}

// resolveVariantSelection vive ahora en ../lib/money (puro y testeado).


// ── GET /admin — Pedidos del restaurante (filtra por sucursal si llega) ──
// locationId es OPCIONAL: si se envía via x-location-id/header se filtra,
// si no, retorna todas las órdenes del restaurante. Antes devolvíamos 400
// si faltaba, lo que tumbaba el panel para restaurantes con una sola
// sucursal o admin sin selector activo.
router.get('/admin', authenticate, requireTenantAccess, requireRole('ADMIN', 'SUPER_ADMIN', 'CASHIER', 'MANAGER', 'OWNER'), async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const where = { restaurantId };
    if (req.locationId) where.locationId = req.locationId;

    // Filtro opt-in `?scope=active`: el TPV ("Tickets abiertos") solo necesita
    // los pedidos ABIERTOS. Sin esto devolvíamos los últimos 200 de CUALQUIER
    // estado (mayormente cerrados) con todos sus items, y el TPV los descargaba
    // solo para descartar ~el 90% en el cliente → el drawer tardaba en cargar.
    // Las páginas admin siguen pidiendo el historial completo (sin el param).
    const ACTIVE_ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OPEN', 'ON_THE_WAY'];
    const isPaidScope = req.query.scope === 'paid';
    if (req.query.scope === 'active' || req.query.status === 'active') {
      where.status = { in: ACTIVE_ORDER_STATUSES };
    } else if (isPaidScope) {
      // `?scope=paid`: tickets ya cobrados del último mes para la pestaña
      // "Cobradas" del TPV. Ventana rodante de 31 días por `paidAt`; si la orden
      // no tiene `paidAt` (datos viejos previos a esa columna) caemos a
      // `createdAt` para no perderla. Payload ligero: sin items ni address — el
      // TPV los muestra en lista y baja el detalle on-demand al reimprimir.
      const PAID_WINDOW_DAYS = 31;
      const cutoff = new Date(Date.now() - PAID_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      where.paymentStatus = 'PAID';
      where.OR = [
        { paidAt: { gte: cutoff } },
        { AND: [{ paidAt: null }, { createdAt: { gte: cutoff } }] },
      ];
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: isPaidScope
        ? [{ paidAt: 'desc' }, { createdAt: 'desc' }]
        : { createdAt: 'desc' },
      take: isPaidScope ? 500 : 200,
      include: isPaidScope
        ? { user: { select: { name: true, phone: true } } }
        : {
            user: { select: { name: true, phone: true } },
            items: { include: { menuItem: { select: { name: true, categoryId: true } } } },
            address: true,
            // Sin esta relación, las cuentas DINE_IN llegaban al TPV con
            // `table` undefined; como las órdenes guardan `tableId` (no
            // `tableNumber`), el selector caía a customerName y toda mesa
            // aparecía como "Publico General" (indistinguible entre sí y
            // mezclada con las del TPV principal). El TPV usa table.name.
            table: { select: { id: true, name: true } },
          },
    });

    // deliveryDriverId es un FK escalar sin relación Prisma, así que el nombre
    // del repartidor se resuelve con una consulta batch y se adjunta como
    // deliveryDriverName para que el TPV muestre "asignado a X". Los repartidores
    // son Employee (no User): el TPV autentica como Employee, así que el id de
    // deliveryDriverId apunta a la tabla Employee.
    const driverIds = [...new Set(orders.map(o => o.deliveryDriverId).filter(Boolean))];
    let driverMap = {};
    if (driverIds.length) {
      const drivers = await prisma.employee.findMany({
        where: { id: { in: driverIds } },
        select: { id: true, name: true },
      });
      driverMap = Object.fromEntries(drivers.map(d => [d.id, d.name]));
    }

    res.json(orders.map(o => ({
      ...o,
      deliveryDriverName: o.deliveryDriverId ? (driverMap[o.deliveryDriverId] || null) : null,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /table/:tableId/open — Orden(es) abiertas de una mesa ────────────
// Permite al TPV saber si una mesa ya tiene cuenta activa para setear el
// activeOrderId y agregar rondas directamente (POST /:id/items) en lugar
// de intentar crear una orden nueva sobre la mesa OCCUPIED.
router.get('/table/:tableId/open', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const orders = await prisma.order.findMany({
      where: {
        tableId: req.params.tableId,
        status: { in: OPEN_TABLE_STATUSES },
        paymentStatus: { not: 'PAID' },
        restaurantId,
      },
      select: { id: true, orderNumber: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    res.json(orders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /:id — Detalle completo (requiere auth + tenant scope) ───────────
router.get('/:id', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) {
      return res.status(400).json({ error: 'Restaurante no identificado' });
    }

    // Filtrar por restaurantId garantiza que solo se devuelva la orden si
    // pertenece al tenant del token. findFirst evita el undefined-bypass de
    // findUnique que Prisma silenciosamente ignoraba.
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, restaurantId },
      include: {
        user: { select: { name: true, phone: true, email: true } },
        items: {
          include: {
            modifiers: true,
            // Solo se consume menuItem.name (fallback de display) y los
            // printerGroups (item + categoría → printerGroup.id) para enrutar
            // comandas a cocina. Antes el include jalaba TODAS las columnas de
            // MenuItem (imágenes, descripción, precios, costos) y de cada
            // printerGroup: payload y serialización innecesarios por cada item.
            menuItem: {
              select: {
                name: true,
                printerGroups: { select: { printerGroup: { select: { id: true } } } },
                category: {
                  select: {
                    printerGroups: { select: { printerGroup: { select: { id: true } } } },
                  },
                },
              }
            }
          }
        },
        address: true,
        table: true,
      }
    });
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    let driver = null;
    if (order.deliveryDriverId) {
      driver = await prisma.employee.findUnique({
        where: { id: order.deliveryDriverId },
        select: { id: true, name: true, phone: true, photo: true }
      });
    }

    res.json({ ...order, driver });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /tpv — Crear pedido ──────────────────────────────────────────
router.post('/tpv', authenticate, requireTenantAccess, requireRole('CASHIER', 'WAITER', 'MANAGER', 'ADMIN', 'OWNER', 'SUPER_ADMIN'), requireActiveShift, validateBody(createOrderSchema), async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    // OJO: subtotal/total del body se IGNORAN a propósito — se recalculan
    // server-side desde las líneas resueltas (ver computeOrderTotals abajo).
    const { items, tableNumber, tableId, numberOfGuests, paymentMethod, discount, customerName, customerPhone, deliveryAddress, status, clientOrderId } = req.body;
    // Tolerancia de nombre: clientes viejos (y replays de la cola offline)
    // mandan `type` en vez de `orderType`. Sin esto un DINE_IN con tableId
    // entraba como TAKEOUT/CONFIRMED: sin ronda 1 y con la mesa libre.
    const orderType = req.body.orderType || req.body.type;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Sin productos' });

    const restaurantId = req.user?.restaurantId || req.restaurantId;

    // Idempotencia DB-level para replays de la cola offline. El cliente puede
    // mandar la misma POST 2x (sync corrió, server respondió, el ack se perdió,
    // próximo tick reintenta). Devolvemos la orden existente sin crear duplicado.
    if (clientOrderId) {
      const existing = await prisma.order.findUnique({
        where: { clientOrderId: String(clientOrderId) },
        include: {
          items: { include: { menuItem: { include: { category: true } }, modifiers: true } },
          rounds: true,
          table: true,
        },
      });
      if (existing) {
        res.setHeader('X-Idempotent-Replay', 'true');
        return res.json(existing);
      }
    }

    // Validar tableId si vino: debe pertenecer a esta sucursal y estar activa.
    let table = null;
    if (tableId) {
      table = await prisma.table.findFirst({
        where: { id: tableId, locationId: req.locationId, isActive: true },
      });
      if (!table) return res.status(400).json({ error: 'Mesa no válida para esta sucursal' });
      // La orden OPEN es la fuente de verdad. El estado de Table puede quedar
      // temporalmente desfasado (AVAILABLE) por una sincronizacion o cliente
      // antiguo; aun asi nunca debemos crear una segunda cuenta para la mesa.
      const existingOrder = await prisma.order.findFirst({
        where: {
          tableId,
          status: { in: OPEN_TABLE_STATUSES },
          paymentStatus: { not: 'PAID' },
          locationId: req.locationId,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, orderNumber: true, total: true, customerName: true,
          _count: { select: { items: true } },
        },
      });

      if (existingOrder) {
        // La mesa YA tiene una cuenta abierta. El front solo cae a crear (en
        // vez de agregar ronda) cuando creia la mesa LIBRE; por eso un merge
        // silencioso aqui encimaria la venta del operador sobre otra cuenta
        // que no sabia que existia (bug reportado: "al abrir una mesa se
        // sobreescribio otra"). Solo fusionamos si el cliente lo pidio
        // explicitamente: el operador confirmo en el dialogo, o es un replay
        // de la cola offline (la comanda ya salio a cocina, no hay vuelta
        // atras). En cualquier otro caso devolvemos 409 con la cuenta
        // existente para que el TPV pregunte en vez de encimar.
        if (req.body.appendToOpenTab === true) {
          if (table.status !== 'OCCUPIED') {
            await prisma.table.update({
              where: { id: tableId },
              data: { status: 'OCCUPIED' },
            });
          }
          // Auditar el merge: antes era invisible. Best-effort (no debe
          // tumbar el guardado de la ronda si falla el log).
          await audit.record(req, audit.AUDIT_EVENTS.TAB_MERGE, {
            resource: `order:${existingOrder.id}`,
            after: {
              orderNumber: existingOrder.orderNumber,
              tableId,
              addedItems: Array.isArray(items) ? items.length : 0,
            },
          }).catch(() => {});
          req.params = { id: existingOrder.id };
          return addRoundHandler(req, res);
        }
        return res.status(409).json({
          code: 'TABLE_HAS_OPEN_TAB',
          error: `La mesa ya tiene la cuenta ${existingOrder.orderNumber} abierta`,
          existingOrder: {
            id: existingOrder.id,
            orderNumber: existingOrder.orderNumber,
            total: existingOrder.total,
            customerName: existingOrder.customerName,
            itemCount: existingOrder._count?.items ?? 0,
          },
        });
      }
    }

    const isDineInTab = (orderType === 'DINE_IN') && !!tableId;
    const paidOnCreate = Boolean(
      paymentMethod && ['DELIVERED', 'COMPLETED', 'PAID'].includes(String(status || '').toUpperCase())
    );

    // Resolver cada item con su menuItem y modificadores (validados contra DB).
    // El precio del item siempre se re-lee del servidor, igual que los priceAdd
    // de los modificadores: el cliente no puede manipular precios.
    const resolvedItems = await Promise.all(items.map(async (item) => {
      const menuItem = await prisma.menuItem.findUnique({
        where: { id: item.menuItemId, restaurantId },
        include: {
          modifierGroups: { include: { modifiers: true } },
          complements: true,
          variants: true,
        },
      });

      const variantSelection = resolveVariantSelection(menuItem, item);
      const modifierIds = extractIds(item.modifiers, 'modifierId');
      const complementIds = extractIds(item.complements, 'complementId');
      const variantIds = extractIds(item.variants, 'variantId');

      // Indexar todos los modificadores válidos del item por id, agrupados.
      const validModsById = new Map();
      const groupsById = new Map();
      for (const g of menuItem?.modifierGroups || []) {
        groupsById.set(g.id, g);
        for (const m of g.modifiers) validModsById.set(m.id, m);
      }

      // Filtrar a sólo los que efectivamente pertenecen al item; agrupar por groupId.
      const selectedByGroup = new Map();
      for (const id of modifierIds) {
        const mod = validModsById.get(id);
        if (!mod) continue;
        const arr = selectedByGroup.get(mod.groupId) || [];
        arr.push(mod);
        selectedByGroup.set(mod.groupId, arr);
      }

      // Aplicar freeModifiersLimit por grupo: los más baratos van gratis primero.
      const { unitExtra: modsExtra, flatMods } = applyFreeModifiers(selectedByGroup, groupsById);
      let unitExtra = modsExtra;

      const validComplementsById = new Map(
        (menuItem?.complements || [])
          .filter((c) => c.isAvailable !== false)
          .map((c) => [c.id, c])
      );
      const selectedComplements = [];
      for (const id of complementIds) {
        const complement = validComplementsById.get(id);
        if (!complement) continue;
        unitExtra += Number(complement.price || 0);
        selectedComplements.push(complement);
      }

      // Variantes multi-select: se cobran como extra sobre el precio base
      // (los sabores en $0 no suman; "Extra aderezo" etc. sí). El precio
      // siempre se re-lee de DB para que el cliente no lo manipule.
      const validVariantsById = new Map(
        (menuItem?.variants || [])
          .filter((v) => v.isAvailable !== false)
          .map((v) => [v.id, v])
      );
      const selectedVariants = [];
      for (const id of variantIds) {
        const variant = validVariantsById.get(id);
        if (!variant) continue;
        unitExtra += Number(variant.price || 0);
        selectedVariants.push(variant);
      }

      const unitPrice = variantSelection.basePrice + unitExtra;
      // Venta por peso: si el producto es soldByWeight y el cliente mandó un
      // weightKg válido, la línea se cobra price/kg × kg con quantity=1. El
      // multiplicador del subtotal es el peso; el precio sigue saliendo del
      // servidor (anti-manipulación). Productos por pieza: weightKg=null y
      // multiplicador = quantity, como siempre.
      const weightKg = resolveWeightKg(menuItem, item.weightKg);
      const lineQty = weightKg != null ? 1 : item.quantity;
      const lineMultiplier = weightKg != null ? weightKg : item.quantity;
      const seatRaw = Number(item.seatNumber);
      const seatNumber = Number.isFinite(seatRaw) && seatRaw >= 1 && seatRaw <= 50
        ? Math.floor(seatRaw)
        : null;
      // FASE 11 · COURSING — normalizar a uppercase y permitir solo
      // strings sanos (1..32 chars). Valores libres pero acotados para
      // que cocina pueda agruparlos sin sorpresas (mismo string siempre).
      const courseRaw = typeof item.course === 'string' ? item.course.trim().toUpperCase() : null;
      const course = courseRaw && courseRaw.length > 0 && courseRaw.length <= 32 ? courseRaw : null;
      return {
        menuItemId: item.menuItemId,
        name: variantSelection.name,
        price: unitPrice,
        quantity: lineQty,
        weightKg,
        subtotal: unitPrice * lineMultiplier,
        notes: appendVariantNotes(appendComplementNotes(item.notes, selectedComplements), selectedVariants),
        seatNumber,
        course,
        _modifiers: flatMods,
      };
    }));

    // FUENTE DE VERDAD DEL COBRO: el subtotal/total se derivan de las líneas
    // resueltas en servidor (que ya incluyen el delta de los modificadores),
    // NUNCA del subtotal/total del payload. Antes se persistía `req.body.total`
    // y cualquier orden con modificadores con precio se cobraba de menos.
    //
    // D2 Meseros v2: el descuento del body solo se acepta si el actor tiene el
    // permiso apply_discount (ADMIN/OWNER bypass, flag canApplyDiscounts o
    // canDiscount legacy, u override token de supervisor). Un WAITER sin
    // permiso no puede auto-descontarse la cuenta: discount forzado a 0.
    const mayDiscount =
      userHasPermission(req, 'apply_discount') || hasValidOverride(req, 'apply_discount');
    const {
      subtotal: serverSubtotal,
      discount: serverDiscount,
      total: serverTotal,
    } = computeOrderTotals(resolvedItems, { discount: mayDiscount ? discount : 0 });

    // ── Defensa en profundidad anti multi-tap ───────────────────────────────
    // Aunque el TPV ya deshabilita el botón Cobrar desde el primer tap, un
    // burst (p.ej. el botón "Cobrar" pulsado N veces) genera N clientOrderId
    // DISTINTOS, así que la idempotencia por clientOrderId de arriba NO los
    // une. Si en los últimos DEDUP_WINDOW_MS el MISMO empleado ya creó en esta
    // sucursal una orden idéntica (mismo tipo, mesa, cliente, total e items),
    // la devolvemos en vez de duplicar. La firma es EXACTA a propósito: dos
    // clientes distintos que pidan lo mismo difieren en mesa/cliente, y el
    // caso anónimo idéntico real (dos "Publico General" iguales) toma más que
    // esta ventana en teclearse — no se fusiona el cobro legítimo.
    const DEDUP_WINDOW_MS = 10_000;
    const buildItemSig = (its) => its
      .map((it) => {
        const mods = (it._modifiers || it.modifiers || [])
          .map((m) => m.modifierId)
          .filter(Boolean)
          .sort()
          .join('+');
        const w = it.weightKg != null ? Number(it.weightKg).toFixed(3) : '';
        return `${it.menuItemId}:${it.quantity}:${w}:${Number(it.price).toFixed(2)}:${it.seatNumber ?? ''}:${mods}`;
      })
      .sort()
      .join('|');
    if (req.user?.id) {
      const newSig = buildItemSig(resolvedItems);
      const recent = await prisma.order.findMany({
        where: {
          restaurantId,
          locationId: req.locationId,
          createdById: req.user.id,
          source: 'TPV',
          orderType: orderType || 'TAKEOUT',
          createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
        },
        include: { items: { include: { modifiers: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      const dup = recent.find((cand) => {
        const sameCtx =
          (cand.tableId || null) === (tableId || null) &&
          (cand.customerName || null) === (customerName || null) &&
          (cand.customerPhone || null) === (customerPhone || null) &&
          Math.abs(Number(cand.total) - Number(serverTotal)) < 0.01;
        return sameCtx && buildItemSig(cand.items) === newSig;
      });
      if (dup) {
        const full = await prisma.order.findUnique({
          where: { id: dup.id },
          include: {
            items: { include: { menuItem: { include: { category: true } }, modifiers: true } },
            rounds: true,
            table: true,
          },
        });
        res.setHeader('X-Dedup-Replay', 'true');
        return res.json(full || dup);
      }
    }

    // Si es dine-in con mesa: status=OPEN (cuenta abierta) y la primera ronda
    // se crea explícita para que el flujo de rondas posteriores quede limpio.
    const order = await prisma.$transaction(async (tx) => {
      // numberOfGuests: clamp 1..50, ignorado si no es DINE_IN.
      const guestsRaw = Number(numberOfGuests);
      const safeGuests = isDineInTab && Number.isFinite(guestsRaw) && guestsRaw >= 1 && guestsRaw <= 50
        ? Math.floor(guestsRaw)
        : null;

      // deliveryAddress sólo se persiste en DELIVERY (en otros tipos queda null).
      const cleanDeliveryAddress = orderType === 'DELIVERY' && typeof deliveryAddress === 'string' && deliveryAddress.trim()
        ? deliveryAddress.trim()
        : null;

      // Directorio de clientes — registro por teléfono. Si la orden trae
      // teléfono, hacemos upsert por (restaurantId, teléfono normalizado):
      // enlazamos la orden al Customer y mantenemos contadores para que el
      // TPV pueda autocompletar y mostrar "cliente frecuente". El nombre/
      // dirección sólo se sobreescriben si vinieron en ESTA orden (no se
      // borran datos previos con un campo vacío).
      let customerId = null;
      const normPhone = normalizePhone(customerPhone);
      if (normPhone) {
        const customer = await tx.customer.upsert({
          where: { restaurantId_phone: { restaurantId, phone: normPhone } },
          create: {
            restaurantId,
            phone: normPhone,
            name: customerName || null,
            address: cleanDeliveryAddress,
            ordersCount: 1,
            totalSpent: serverTotal,
            lastOrderAt: new Date(),
          },
          update: {
            ...(customerName ? { name: customerName } : {}),
            ...(cleanDeliveryAddress ? { address: cleanDeliveryAddress } : {}),
            ordersCount: { increment: 1 },
            totalSpent: { increment: serverTotal },
            lastOrderAt: new Date(),
          },
        });
        customerId = customer.id;
      }

      // Folio secuencial continuo por restaurante. Atómico dentro de esta misma
      // $transaction: si la creación falla, el folio hace rollback (sin huecos).
      const orderNumber = await nextOrderNumber(tx, restaurantId);

      const created = await tx.order.create({
        data: {
          restaurantId,
          locationId: req.locationId,
          shiftId: req.shiftId,
          // Empleado del TPV que tomó el pedido (req.user.id = Employee.id en
          // sesiones del TPV). Permite atribuir actividad a meseros/cajeros.
          createdById: req.user?.id || null,
          orderNumber,
          clientOrderId: clientOrderId ? String(clientOrderId) : null,
          status: status || (isDineInTab ? 'OPEN' : 'CONFIRMED'),
          orderType: orderType || 'TAKEOUT',
          tableNumber: tableNumber || (table ? null : null),
          tableId: tableId || null,
          numberOfGuests: safeGuests,
          paymentMethod: paymentMethod || 'CASH',
          paymentStatus: paidOnCreate ? 'PAID' : 'PENDING',
          paidAt: paidOnCreate ? new Date() : null,
          cashCollected: paidOnCreate && paymentMethod === 'CASH',
          cashCollectedAt: paidOnCreate && paymentMethod === 'CASH' ? new Date() : null,
          subtotal: serverSubtotal,
          discount: serverDiscount,
          total: serverTotal,
          source: 'TPV',
          customerName, customerPhone,
          deliveryAddress: cleanDeliveryAddress,
          customerId,
        },
      });

      let roundId = null;
      if (isDineInTab) {
        const round = await tx.orderRound.create({
          data: { orderId: created.id, roundNumber: 1 },
        });
        roundId = round.id;
        await tx.table.update({ where: { id: tableId }, data: { status: 'OCCUPIED' } });
      }

      // Creamos cada OrderItem individualmente porque los modificadores son
      // una relación nested write (no se puede con createMany).
      for (const it of resolvedItems) {
        const { _modifiers, ...itemData } = it;
        await tx.orderItem.create({
          data: {
            ...itemData,
            orderId: created.id,
            roundId,
            modifiers: _modifiers.length
              ? { create: _modifiers.map(m => ({ modifierId: m.modifierId, name: m.name, priceAdd: m.priceAdd })) }
              : undefined,
          },
        });
      }

      return tx.order.findUnique({
        where: { id: created.id },
        include: {
          items: { include: { menuItem: { include: { category: true } }, modifiers: true } },
          rounds: true,
          table: true,
        },
      });
    });

    // Pasamos order.items (con id) para que discountInventory pueda
    // persistir costSnapshot en cada OrderItem.
    await discountInventory(prisma, order.items, order.id, restaurantId, req.locationId);
    if (paidOnCreate) {
      await releaseTableIfDineIn(order.id);
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`restaurant:${restaurantId}:location:${req.locationId}:admins`).emit('order:new', order);
    }

    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /:id/items — Añadir ronda a una orden activa ──────────────────
// Crea una nueva OrderRound (roundNumber = max+1), inserta los items con
// roundId tagueado y manda a cocina SOLO los items de esa ronda (no
// reimprime la cuenta entera).
//
// Alias: POST /:id/rounds — mismo handler, nombre canónico para clientes
// nuevos del API. /items se mantiene por compatibilidad con la TPV actual.
async function addRoundHandler(req, res) {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const { id } = req.params;
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Sin productos' });
    }

    const restaurantId = req.user?.restaurantId || req.restaurantId;

    // Verificar que la orden existe, pertenece a la misma sucursal y sigue abierta.
    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Orden no encontrada' });
    if (existing.locationId !== req.locationId) {
      return res.status(403).json({ error: 'La orden pertenece a otra sucursal' });
    }
    if (['DELIVERED', 'CANCELLED'].includes(existing.status)) {
      return res.status(400).json({ error: 'No se pueden agregar ítems a una orden cerrada' });
    }
    if (existing.paymentStatus === 'PAID') {
      return res.status(400).json({ error: 'La orden ya fue pagada' });
    }

    // Re-leer precios desde DB (misma lógica de defensa que POST /tpv).
    const newItemsData = await Promise.all(items.map(async (item) => {
      const menuItem = await prisma.menuItem.findUnique({
        where: { id: item.menuItemId, restaurantId },
        include: {
          modifierGroups: { include: { modifiers: true } },
          complements: true,
          variants: true,
        },
      });
      const variantSelection = resolveVariantSelection(menuItem, item);
      const modifierIds = extractIds(item.modifiers, 'modifierId');
      const complementIds = extractIds(item.complements, 'complementId');
      const variantIds = extractIds(item.variants, 'variantId');

      const validModsById = new Map();
      const groupsById = new Map();
      for (const g of menuItem?.modifierGroups || []) {
        groupsById.set(g.id, g);
        for (const m of g.modifiers) validModsById.set(m.id, m);
      }

      const selectedByGroup = new Map();
      for (const modId of modifierIds) {
        const mod = validModsById.get(modId);
        if (!mod) continue;
        const arr = selectedByGroup.get(mod.groupId) || [];
        arr.push(mod);
        selectedByGroup.set(mod.groupId, arr);
      }

      const { unitExtra: modsExtra, flatMods } = applyFreeModifiers(selectedByGroup, groupsById);
      let unitExtra = modsExtra;

      const validComplementsById = new Map(
        (menuItem?.complements || [])
          .filter((c) => c.isAvailable !== false)
          .map((c) => [c.id, c])
      );
      const selectedComplements = [];
      for (const complementId of complementIds) {
        const complement = validComplementsById.get(complementId);
        if (!complement) continue;
        unitExtra += Number(complement.price || 0);
        selectedComplements.push(complement);
      }

      const validVariantsById = new Map(
        (menuItem?.variants || [])
          .filter((v) => v.isAvailable !== false)
          .map((v) => [v.id, v])
      );
      const selectedVariants = [];
      for (const variantId of variantIds) {
        const variant = validVariantsById.get(variantId);
        if (!variant) continue;
        unitExtra += Number(variant.price || 0);
        selectedVariants.push(variant);
      }

      const price = variantSelection.basePrice + unitExtra;
      // Venta por peso (ver create-order): peso × precio/kg, quantity=1.
      const weightKg = resolveWeightKg(menuItem, item.weightKg);
      const qty = weightKg != null ? 1 : Math.max(1, parseInt(item.quantity, 10) || 1);
      const lineMultiplier = weightKg != null ? weightKg : qty;
      const seatRaw = Number(item.seatNumber);
      const seatNumber = Number.isFinite(seatRaw) && seatRaw >= 1 && seatRaw <= 50
        ? Math.floor(seatRaw)
        : null;
      const courseRaw = typeof item.course === 'string' ? item.course.trim().toUpperCase() : null;
      const course = courseRaw && courseRaw.length > 0 && courseRaw.length <= 32 ? courseRaw : null;
      return {
        menuItemId: item.menuItemId,
        name: variantSelection.name,
        price,
        quantity: qty,
        weightKg,
        subtotal: price * lineMultiplier,
        notes: appendVariantNotes(appendComplementNotes(item.notes, selectedComplements), selectedVariants),
        seatNumber,
        course,
        _modifiers: flatMods,
      };
    }));

    // Transaccional: crear OrderRound, insertar items con roundId, recalcular totales.
    const { updated, round } = await prisma.$transaction(async (tx) => {
      const lastRound = await tx.orderRound.findFirst({
        where: { orderId: id },
        orderBy: { roundNumber: 'desc' },
        select: { roundNumber: true },
      });
      const nextNumber = (lastRound?.roundNumber || 0) + 1;

      const newRound = await tx.orderRound.create({
        data: { orderId: id, roundNumber: nextNumber },
      });

      for (const itemData of newItemsData) {
        const { _modifiers, ...data } = itemData;
        await tx.orderItem.create({
          data: {
            ...data,
            orderId: id,
            roundId: newRound.id,
            modifiers: _modifiers.length
              ? { create: _modifiers.map(m => ({ modifierId: m.modifierId, name: m.name, priceAdd: m.priceAdd })) }
              : undefined,
          },
        });
      }

      const all = await tx.orderItem.findMany({ where: { orderId: id } });
      // Mismo helper que el create: subtotal/total siempre desde las líneas en DB.
      const { subtotal, total } = computeOrderTotals(all, {
        discount: existing.discount || 0,
        deliveryFee: existing.deliveryFee || 0,
      });

      const finalOrder = await tx.order.update({
        where: { id },
        data: { subtotal, total },
        include: {
          user: { select: { name: true, phone: true } },
          items: { include: { menuItem: { select: { name: true, categoryId: true } }, modifiers: true } },
          rounds: { orderBy: { roundNumber: 'asc' } },
          address: true,
          table: true,
        },
      });

      return { updated: finalOrder, round: newRound };
    });

    // Descontar inventario SOLO de los items de la nueva ronda. Filtramos
    // por roundId para no re-descontar items de rondas anteriores que ya
    // habían sido procesados al crearse.
    const newRoundItems = (updated.items || []).filter((it) => it.roundId === round.id);
    await discountInventory(prisma, newRoundItems, id, restaurantId, req.locationId);

    // Imprimir SOLO los items de esta ronda en cocina. Fire-and-forget.
    try {
      const { printOrderRoundTicket } = require('../services/printer.service');
      printOrderRoundTicket(updated, round.id).catch(() => {});
    } catch (err) { console.error('Print round ticket no disponible:', err.message); }

    // Notificar a clientes conectados (admin/cocina) para refresco en vivo.
    const io = req.app.get('io');
    if (io) {
      io.to(`restaurant:${restaurantId}:location:${req.locationId}:admins`)
        .emit('order:updated', updated);
    }

    res.json({ ...updated, lastRound: round });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

router.post('/:id/items',  authenticate, requireTenantAccess, requireRole('ADMIN', 'SUPER_ADMIN', 'CASHIER', 'MANAGER', 'OWNER', 'WAITER'), validateBody(addItemsSchema), addRoundHandler);
router.post('/:id/rounds', authenticate, requireTenantAccess, requireRole('ADMIN', 'SUPER_ADMIN', 'CASHIER', 'MANAGER', 'OWNER', 'WAITER'), validateBody(addItemsSchema), addRoundHandler);

// ── PUT /items/:itemId — Editar cantidad/notas de un item de orden abierta
// Sólo admin/manager. Bloquea ediciones si la orden está cerrada o pagada.
// Recalcula subtotal del item y totales de la orden, y emite order:updated
// por socket para refresco en vivo de admin/cocina.
router.put('/items/:itemId', authenticate, requireTenantAccess, requireRole('ADMIN', 'SUPER_ADMIN', 'CASHIER', 'MANAGER', 'OWNER'), async (req, res) => {
  try {
    const { quantity, notes, weightKg } = req.body || {};
    const restaurantId = req.user?.restaurantId || req.restaurantId;

    const orderItem = await prisma.orderItem.findUnique({
      where: { id: req.params.itemId },
      include: { order: true, modifiers: true },
    });
    if (!orderItem) return res.status(404).json({ error: 'Item no encontrado' });
    if (orderItem.order.restaurantId !== restaurantId) {
      return res.status(403).json({ error: 'Item de otro restaurante' });
    }
    if (orderItem.order.locationId && req.locationId && orderItem.order.locationId !== req.locationId) {
      return res.status(403).json({ error: 'Item de otra sucursal' });
    }
    if (['DELIVERED', 'CANCELLED'].includes(orderItem.order.status)) {
      return res.status(400).json({ error: 'La orden ya está cerrada' });
    }
    if (orderItem.order.paymentStatus === 'PAID') {
      return res.status(400).json({ error: 'La orden ya fue pagada' });
    }

    // Validar inputs. Si no viene quantity/notes válido, no-op para ese campo.
    const newNotes = notes !== undefined
      ? (typeof notes === 'string' ? notes.slice(0, 200) : null)
      : orderItem.notes;

    // Línea por peso: se edita weightKg (decimal), quantity queda en 1 y el
    // subtotal = price/kg × kg. Línea por pieza: se edita quantity (entero).
    const isWeightLine = orderItem.weightKg != null;
    let newQty = orderItem.quantity;
    let newWeightKg = isWeightLine ? Number(orderItem.weightKg) : null;
    if (isWeightLine) {
      if (weightKg !== undefined) {
        const w = Number(weightKg);
        if (Number.isFinite(w) && w > 0) newWeightKg = Math.round(w * 1000) / 1000;
      }
      newQty = 1;
    } else if (quantity !== undefined) {
      newQty = Math.max(1, Math.min(99, parseInt(quantity, 10) || orderItem.quantity));
    }

    // Subtotal del item = price unitario × (kg | quantity). price ya incluye
    // los modificadores aplicados al item (ver lógica de POST /tpv).
    const newSubtotal = orderItem.price * (isWeightLine ? newWeightKg : newQty);

    const updatedOrder = await prisma.$transaction(async (tx) => {
      await tx.orderItem.update({
        where: { id: req.params.itemId },
        data: { quantity: newQty, weightKg: newWeightKg, subtotal: newSubtotal, notes: newNotes },
      });

      const remaining = await tx.orderItem.findMany({
        where: { orderId: orderItem.orderId },
        select: { subtotal: true },
      });
      const newOrderSubtotal = remaining.reduce((s, i) => s + (i.subtotal || 0), 0);
      const discount = orderItem.order.discount || 0;
      const deliveryFee = orderItem.order.deliveryFee || 0;
      const newTotal = newOrderSubtotal - discount + deliveryFee;

      return tx.order.update({
        where: { id: orderItem.orderId },
        data: { subtotal: newOrderSubtotal, total: newTotal },
        include: {
          items: { include: { menuItem: { select: { name: true, categoryId: true } }, modifiers: true } },
          rounds: { orderBy: { roundNumber: 'asc' } },
          table: true,
        },
      });
    });

    const io = req.app.get('io');
    if (io && updatedOrder.locationId) {
      io.to(`restaurant:${restaurantId}:location:${updatedOrder.locationId}:admins`)
        .emit('order:updated', updatedOrder);
    }

    res.json(updatedOrder);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /items/:itemId — Eliminar item de orden abierta
// Misma protección que PUT. Recalcula totales tras la eliminación.
router.delete('/items/:itemId', authenticate, requireTenantAccess, requireRole('ADMIN', 'SUPER_ADMIN', 'CASHIER', 'MANAGER', 'OWNER'), async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;

    const orderItem = await prisma.orderItem.findUnique({
      where: { id: req.params.itemId },
      include: { order: true },
    });
    if (!orderItem) return res.status(404).json({ error: 'Item no encontrado' });
    if (orderItem.order.restaurantId !== restaurantId) {
      return res.status(403).json({ error: 'Item de otro restaurante' });
    }
    if (orderItem.order.locationId && req.locationId && orderItem.order.locationId !== req.locationId) {
      return res.status(403).json({ error: 'Item de otra sucursal' });
    }
    if (['DELIVERED', 'CANCELLED'].includes(orderItem.order.status)) {
      return res.status(400).json({ error: 'La orden ya está cerrada' });
    }
    if (orderItem.order.paymentStatus === 'PAID') {
      return res.status(400).json({ error: 'La orden ya fue pagada' });
    }

    // RBAC · Anular un producto YA ENVIADO a cocina (pertenece a una ronda
    // con comanda emitida) requiere `cancel_items`. Quitar un item recién
    // agregado y aún no enviado (sin roundId) sigue libre — es parte de armar
    // el ticket. OWNER/ADMIN tienen bypass; el resto necesita el permiso o un
    // override de supervisor (header x-override-token).
    if (orderItem.roundId &&
        !userHasPermission(req, 'cancel_items') &&
        !hasValidOverride(req, 'cancel_items')) {
      return res.status(403).json({
        error: 'No tienes autorización para anular productos ya enviados a cocina',
        code: 'PERMISSION_REQUIRED',
        requiredPermission: 'cancel_items',
      });
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      await tx.orderItem.delete({ where: { id: req.params.itemId } });

      const remaining = await tx.orderItem.findMany({
        where: { orderId: orderItem.orderId },
        select: { subtotal: true },
      });
      const newSubtotal = remaining.reduce((s, i) => s + (i.subtotal || 0), 0);
      const discount = orderItem.order.discount || 0;
      const deliveryFee = orderItem.order.deliveryFee || 0;
      const newTotal = newSubtotal - discount + deliveryFee;

      return tx.order.update({
        where: { id: orderItem.orderId },
        data: { subtotal: newSubtotal, total: newTotal },
        include: {
          items: { include: { menuItem: { select: { name: true, categoryId: true } }, modifiers: true } },
          rounds: { orderBy: { roundNumber: 'asc' } },
          table: true,
        },
      });
    });

    const io = req.app.get('io');
    if (io && updatedOrder.locationId) {
      io.to(`restaurant:${restaurantId}:location:${updatedOrder.locationId}:admins`)
        .emit('order:updated', updatedOrder);
    }

    res.json(updatedOrder);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GESTIÓN DE PAGOS Y CUENTAS ──

// Al cobrar un dine-in, la mesa queda limpia y disponible inmediatamente.
async function releaseTableIfDineIn(orderId) {
  await releaseTableAfterPayment(prisma, orderId).catch(() => {});
}

router.post('/:id/confirm-payment', authenticate, requireTenantAccess, requireRole('ADMIN', 'SUPER_ADMIN', 'CASHIER', 'MANAGER', 'OWNER'), async (req, res) => {
  try {
    const order = await prisma.order.update({
      where: { id: req.params.id, restaurantId: req.restaurantId || req.user?.restaurantId },
      data: { status: 'CONFIRMED', paidAt: new Date(), paymentStatus: 'PAID' },
      include: { user: true }
    });
    await releaseTableIfDineIn(order.id);
    res.json({ ok: true, order });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/print-bill', authenticate, requireTenantAccess, requireRole('ADMIN', 'SUPER_ADMIN', 'CASHIER', 'MANAGER', 'OWNER', 'WAITER'), async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id, restaurantId: req.restaurantId || req.user?.restaurantId },
      include: { items: { include: { menuItem: true } } }
    });
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    // Llamada al servicio de impresión (debe estar en services/printer.service)
    try {
      const { printBillTicket } = require('../services/printer.service');
      await printBillTicket(order);
    } catch (err) { console.error('Error impresora:', err.message); }

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Aplica/edita el descuento de un pedido ya guardado y recalcula el total.
// Lo usa el TPV en el paso final de cobro. Persiste en Order.discount y
// audita DISCOUNT_APPLIED (quién, antes/después, motivo). Consistente con la
// fórmula del resto del archivo: total = subtotal - discount + deliveryFee.
// D2 Meseros v2: además del rol, exige el permiso apply_discount (RBAC
// granular). WAITER por default no lo tiene; puede pedir override de
// supervisor (x-override-token) sin salir de su pantalla.
router.put('/:id/discount', authenticate, requireTenantAccess, requireRole('CASHIER', 'WAITER', 'MANAGER', 'ADMIN', 'OWNER', 'SUPER_ADMIN'), requirePermission('apply_discount'), async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const { type, value, reason } = req.body || {};
    const numValue = Number(value);
    if (!['percent', 'fixed'].includes(type) || !Number.isFinite(numValue) || numValue < 0) {
      return res.status(400).json({ error: 'Descuento inválido' });
    }

    const order = await prisma.order.findFirst({
      where: { id: req.params.id, restaurantId },
      select: { id: true, subtotal: true, discount: true, deliveryFee: true, total: true, orderNumber: true, status: true },
    });
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (['DELIVERED', 'CANCELLED'].includes(order.status)) {
      return res.status(409).json({ error: 'No se puede modificar un pedido cerrado' });
    }

    const subtotal = order.subtotal || 0;
    const deliveryFee = order.deliveryFee || 0;
    const rawDiscount = type === 'percent' ? subtotal * (numValue / 100) : numValue;
    // Acotado a [0, subtotal] y redondeado a centavos.
    const discount = Math.min(Math.max(0, Math.round(rawDiscount * 100) / 100), subtotal);
    const total = Math.max(0, subtotal - discount + deliveryFee);

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { discount, total },
    });

    audit.record(req, audit.AUDIT_EVENTS.DISCOUNT_APPLIED, {
      resource: `order:${order.id}`,
      reason: typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 200) : null,
      before: { discount: order.discount, total: order.total },
      after: { discount, total, type, value: numValue, orderNumber: order.orderNumber },
    }).catch(() => {});

    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/confirm-cash', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const order = await prisma.order.update({
      where: { id: req.params.id, restaurantId: req.restaurantId || req.user?.restaurantId },
      data: {
        cashCollected: true,
        cashCollectedAt: new Date(),
        paymentStatus: 'PAID',
        paidAt: new Date(),
        status: 'DELIVERED',
      }
    });

    // Kick del cajón: fire-and-forget. Un cobro nunca debe fallar porque el
    // cajón esté desconectado o no haya impresora de caja configurada.
    try {
      const { kickCashDrawerForLocation } = require('../services/printer.service');
      kickCashDrawerForLocation(order.locationId).catch(() => {});
    } catch (err) { console.error('Drawer kick no disponible:', err.message); }

    // Si era dine-in, dejar la mesa limpia y disponible.
    await releaseTableIfDineIn(order.id);

    // Avisar a la caja que el efectivo se confirmó (push nativo en el TPV).
    // El cobro en efectivo no pasaba por ningún emit, así que era la única
    // confirmación de pago que NO disparaba notificación. Mismo evento que
    // usan online/terminal para que el TPV lo trate igual.
    const io = req.app.get('io');
    if (io) {
      const payload = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        total: order.total,
        paymentMethod: 'CASH',
        source: 'CASH',
      };
      // Sala base: el TPV se auto-une ahí (index.js). Un solo emit — no a
      // location-admins también, o el TPV lo recibiría doble.
      io.to(`restaurant:${order.restaurantId}`).emit('order:payment:confirmed', payload);
    }

    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/status', authenticate, requireTenantAccess, validateBody(updateStatusSchema), async (req, res) => {
  try {
    const { status } = req.body;
    // Estado previo: el restore de inventario solo debe correr en la
    // transición real → CANCELLED (no si la orden ya estaba cancelada).
    const existing = await prisma.order.findFirst({
      where: { id: req.params.id, restaurantId: req.user?.restaurantId || req.restaurantId },
      select: { id: true, status: true },
    });
    if (!existing) return res.status(404).json({ error: 'Pedido no encontrado' });

    const order = await prisma.order.update({
      where: { id: existing.id },
      data: { status }
    });

    // Cancelar repone el stock que la orden descontó al venderse. Best-effort:
    // la cancelación no debe fallar por inventario, pero sí queda log.
    if (status === 'CANCELLED' && existing.status !== 'CANCELLED') {
      await restoreInventoryForCancelledOrder(prisma, order.id).catch((e) =>
        console.error('[orders] restoreInventory al cancelar:', e.message)
      );
    }

    // Cancelar un dine-in libera la mesa (AVAILABLE), no DIRTY: el ticket
    // nunca llegó a usarse. Si no se libera, la mesa queda OCCUPIED con
    // un ticket fantasma y el siguiente flow de "Comer Aquí" se rompe.
    // Idempotente: si la mesa ya fue eliminada o liberada, no fallar.
    if (status === 'CANCELLED' && order.tableId && order.orderType === 'DINE_IN') {
      await prisma.table.update({
        where: { id: order.tableId },
        data: { status: 'AVAILABLE' },
      }).catch(() => {});
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`restaurant:${order.restaurantId}:location:${order.locationId}:admins`).emit('order:updated', order);
    }

    // Notificar al cliente el cambio de estado (push + WhatsApp con la config
    // del restaurante). Best-effort: no bloquea la respuesta al operador y los
    // pedidos sin teléfono (ej. dine-in del TPV) se omiten dentro del servicio.
    const { notifyOrderStatus } = require('../services/notifications.service');
    notifyOrderStatus(order, status).catch((err) =>
      console.error('[orders] notifyOrderStatus:', err.message)
    );

    // Auditoría best-effort de la cancelación (acción sensible: quién y qué).
    if (status === 'CANCELLED') {
      audit.record(req, audit.AUDIT_EVENTS.ORDER_CANCEL, {
        resource: `order:${order.id}`,
        after: {
          orderNumber: order.orderNumber,
          orderType: order.orderType,
          total: order.total,
          tableId: order.tableId,
        },
      }).catch(() => {});
    }

    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/payment', authenticate, requireTenantAccess, validateBody(updatePaymentSchema), async (req, res) => {
  try {
    const { paymentMethod } = req.body;
    const order = await prisma.order.update({
      where: { id: req.params.id, restaurantId: req.user?.restaurantId || req.restaurantId },
      data: {
        paymentMethod,
        paymentStatus: 'PAID',
        status: 'DELIVERED',
        paidAt: new Date(),
        cashCollected: paymentMethod === 'CASH',
        cashCollectedAt: paymentMethod === 'CASH' ? new Date() : null,
      }
    });

    await releaseTableIfDineIn(order.id);

    const io = req.app.get('io');
    if (io) {
      io.to(`restaurant:${order.restaurantId}:location:${order.locationId}:admins`).emit('order:updated', order);
    }

    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /:id/type — Cambiar el tipo de una orden abierta
// (DINE_IN ↔ TAKEOUT ↔ DELIVERY). Útil cuando el cliente pidió en mesa y
// luego decide llevar/domicilio (o viceversa). Reglas de saneo:
//   · type !== 'DINE_IN'  → tableId: null. Si venía de dine-in con mesa
//     asignada, se libera la mesa a AVAILABLE (el ticket se reasigna; la
//     mesa nunca llegó a "usarse", por eso no va a DIRTY).
//   · type !== 'DELIVERY' → deliveryAddress: null.
//   · type === 'DELIVERY' → se acepta deliveryAddress opcional del body.
// No se permite sobre órdenes ya pagadas ni cerradas (DELIVERED/CANCELLED).
const ORDER_TYPES = ['DINE_IN', 'TAKEOUT', 'DELIVERY'];
router.patch('/:id/type', authenticate, requireTenantAccess, requireRole('ADMIN', 'SUPER_ADMIN', 'CASHIER', 'MANAGER', 'OWNER', 'WAITER'), async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const { type, deliveryAddress } = req.body || {};
    if (!ORDER_TYPES.includes(type)) {
      return res.status(400).json({ error: `Tipo inválido. Use uno de: ${ORDER_TYPES.join(', ')}` });
    }

    const existing = await prisma.order.findFirst({
      where: { id: req.params.id, restaurantId },
      select: { id: true, orderType: true, tableId: true, locationId: true, status: true, paymentStatus: true },
    });
    if (!existing) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (existing.paymentStatus === 'PAID') {
      return res.status(400).json({ error: 'No se puede cambiar el tipo de una orden ya pagada' });
    }
    if (['DELIVERED', 'CANCELLED'].includes(existing.status)) {
      return res.status(400).json({ error: 'No se puede cambiar el tipo de una orden cerrada' });
    }

    const order = await prisma.order.update({
      where: { id: existing.id },
      data: {
        orderType: type,
        // undefined = no tocar (al pasar A dine-in conservamos la mesa actual).
        tableId: type === 'DINE_IN' ? undefined : null,
        deliveryAddress:
          type === 'DELIVERY'
            ? (typeof deliveryAddress === 'string' && deliveryAddress.trim()
                ? deliveryAddress.trim()
                : undefined)
            : null,
      },
    });

    // Salir de un dine-in con mesa asignada libera la mesa.
    if (existing.orderType === 'DINE_IN' && existing.tableId && type !== 'DINE_IN') {
      await prisma.table.update({
        where: { id: existing.tableId },
        data: { status: 'AVAILABLE' },
      }).catch(() => {});
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`restaurant:${order.restaurantId}:location:${order.locationId}:admins`).emit('order:updated', order);
    }

    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /:id/transfer-to/:targetId — Transferir todos los items
// de una orden abierta a otra orden abierta. La orden origen se cierra
// (CANCELLED) y, si era dine-in, libera la mesa. Disponible para roles
// operativos de caja y supervisión; nunca para meseros en modo préstamo.
//
// /merge es alias del mismo handler. Diferencia conceptual:
//   transfer → mover toda una cuenta a otra mesa
//   merge    → fusionar dos cuentas existentes (mismo flujo)
// Ambos tratan los items de la origen como ítems del destino.
async function transferOrderHandler(req, res) {
  try {
    const { id, targetId } = req.params;
    if (id === targetId) return res.status(400).json({ error: 'Origen y destino son la misma orden' });

    const restaurantId = req.user?.restaurantId || req.restaurantId;

    const [source, target] = await Promise.all([
      prisma.order.findUnique({ where: { id }, include: { items: true } }),
      prisma.order.findUnique({ where: { id: targetId }, include: { items: true } }),
    ]);
    if (!source) return res.status(404).json({ error: 'Orden origen no encontrada' });
    if (!target) return res.status(404).json({ error: 'Orden destino no encontrada' });
    if (source.restaurantId !== restaurantId || target.restaurantId !== restaurantId) {
      return res.status(403).json({ error: 'Las órdenes pertenecen a otro restaurante' });
    }
    if (source.locationId && target.locationId && source.locationId !== target.locationId) {
      return res.status(400).json({ error: 'Las órdenes son de sucursales distintas' });
    }
    for (const o of [source, target]) {
      if (['DELIVERED', 'CANCELLED'].includes(o.status)) {
        return res.status(400).json({ error: `Orden ${o.id === id ? 'origen' : 'destino'} cerrada` });
      }
      if (o.paymentStatus === 'PAID') {
        return res.status(400).json({ error: `Orden ${o.id === id ? 'origen' : 'destino'} ya pagada` });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Mover items origen → destino. Usamos updateMany para no perder
      // modificadores ni roundId/seatNumber (todos viven en OrderItem).
      await tx.orderItem.updateMany({
        where: { orderId: id },
        data: { orderId: targetId },
      });

      // Recalcular totales del destino con todos los items consolidados.
      const items = await tx.orderItem.findMany({
        where: { orderId: targetId },
        select: { subtotal: true },
      });
      const newSubtotal = items.reduce((s, i) => s + (i.subtotal || 0), 0);
      const discount = target.discount || 0;
      const deliveryFee = target.deliveryFee || 0;
      const newTotal = newSubtotal - discount + deliveryFee;

      const updatedTarget = await tx.order.update({
        where: { id: targetId },
        data: { subtotal: newSubtotal, total: newTotal },
        include: {
          items: { include: { menuItem: { select: { name: true, categoryId: true } }, modifiers: true } },
          rounds: { orderBy: { roundNumber: 'asc' } },
          table: true,
        },
      });

      // Cancelar origen (no la borramos para preservar audit trail) y
      // liberar mesa si era dine-in.
      await tx.order.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          notes: `${source.notes ? source.notes + '\n' : ''}[Transferida a orden ${target.orderNumber || targetId.slice(-6)}]`,
        },
      });
      if (source.tableId && source.orderType === 'DINE_IN') {
        await tx.table.update({
          where: { id: source.tableId },
          data: { status: 'AVAILABLE' },
        }).catch(() => { /* mesa eliminada o ya liberada */ });
      }

      return updatedTarget;
    });

    const io = req.app.get('io');
    if (io && result.locationId) {
      io.to(`restaurant:${restaurantId}:location:${result.locationId}:admins`)
        .emit('order:updated', result);
    }

    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

const requireOrderMergeRole = requireRole(
  'ADMIN',
  'SUPER_ADMIN',
  'OWNER',
  'MANAGER',
  'CASHIER',
);

router.post('/:id/transfer-to/:targetId', authenticate, requireTenantAccess, requireOrderMergeRole, transferOrderHandler);
router.post('/:id/merge/:targetId',       authenticate, requireTenantAccess, requireOrderMergeRole, transferOrderHandler);

// Include estándar para devolver una orden hidratada al TPV (mismo shape que
// GET /:id, sin el driver que ahí se anexa aparte). Lo comparten rename y split.
const ORDER_DETAIL_INCLUDE = {
  user: { select: { name: true, phone: true, email: true } },
  items: {
    include: {
      modifiers: true,
      menuItem: {
        include: {
          category: { include: { printerGroups: { include: { printerGroup: true } } } },
          printerGroups: { include: { printerGroup: true } },
        },
      },
    },
  },
  address: true,
  table: true,
  rounds: { orderBy: { roundNumber: 'asc' } },
};

// ── PATCH /:id/name — Renombrar (etiquetar) una cuenta abierta ─────────
// Independiente de customerName/mesa: solo escribe Order.ticketName. Enviar
// "" o null limpia la etiqueta. CASHIER+ ya que es operación cotidiana.
router.patch(
  '/:id/name',
  authenticate,
  requireTenantAccess,
  requireRole('CASHIER', 'WAITER', 'MANAGER', 'ADMIN', 'OWNER', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const restaurantId = req.user?.restaurantId || req.restaurantId;
      const raw = req.body?.ticketName;
      if (raw != null && typeof raw !== 'string') {
        return res.status(400).json({ error: 'ticketName inválido' });
      }
      const ticketName = raw == null ? null : (String(raw).trim().slice(0, 60) || null);

      const existing = await prisma.order.findFirst({ where: { id: req.params.id, restaurantId } });
      if (!existing) return res.status(404).json({ error: 'Orden no encontrada' });

      const updated = await prisma.order.update({
        where: { id: req.params.id },
        data: { ticketName },
        include: ORDER_DETAIL_INCLUDE,
      });

      const io = req.app.get('io');
      if (io && updated.locationId) {
        io.to(`restaurant:${restaurantId}:location:${updated.locationId}:admins`)
          .emit('order:updated', updated);
      }

      res.json(updated);
    } catch (e) { res.status(500).json({ error: e.message }); }
  },
);

// ── PATCH/PUT /:id/details — Editar datos del cliente de una cuenta abierta
// Permite actualizar customerName / customerPhone / deliveryAddress sin tocar
// los items ni reabrir la orden. Solo se escriben los campos PRESENTES en el
// body (undefined = no cambia; null o "" = limpia). Bloquea órdenes
// cerradas/canceladas. Se expone como PATCH (semántico) y PUT (para que el
// TPV lo encole vía apiOrQueue, que solo soporta POST/PUT).
async function updateOrderDetailsHandler(req, res) {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const body = req.body || {};

    // Normaliza un string opcional: undefined no toca el campo, null/"" lo
    // limpia, y cualquier otra cadena se recorta al límite indicado.
    const normField = (val, max) => {
      if (val === undefined) return undefined;
      if (val === null) return null;
      if (typeof val !== 'string') return undefined;
      const trimmed = val.trim().slice(0, max);
      return trimmed || null;
    };

    const data = {};
    const customerName = normField(body.customerName, 120);
    const customerPhone = normField(body.customerPhone, 30);
    const deliveryAddress = normField(body.deliveryAddress, 250);
    if (customerName !== undefined) data.customerName = customerName;
    if (customerPhone !== undefined) data.customerPhone = customerPhone;
    if (deliveryAddress !== undefined) data.deliveryAddress = deliveryAddress;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Sin datos para actualizar' });
    }

    const existing = await prisma.order.findFirst({ where: { id: req.params.id, restaurantId } });
    if (!existing) return res.status(404).json({ error: 'Orden no encontrada' });
    if (['DELIVERED', 'CANCELLED'].includes(existing.status)) {
      return res.status(400).json({ error: 'No se pueden editar datos de una orden cerrada' });
    }

    const updated = await prisma.order.update({
      where: { id: req.params.id },
      data,
      include: ORDER_DETAIL_INCLUDE,
    });

    const io = req.app.get('io');
    if (io && updated.locationId) {
      io.to(`restaurant:${restaurantId}:location:${updated.locationId}:admins`)
        .emit('order:updated', updated);
    }

    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

router.patch(
  '/:id/details',
  authenticate,
  requireTenantAccess,
  requireRole('CASHIER', 'WAITER', 'MANAGER', 'ADMIN', 'OWNER', 'SUPER_ADMIN'),
  updateOrderDetailsHandler,
);
router.put(
  '/:id/details',
  authenticate,
  requireTenantAccess,
  requireRole('CASHIER', 'WAITER', 'MANAGER', 'ADMIN', 'OWNER', 'SUPER_ADMIN'),
  updateOrderDetailsHandler,
);

// ── POST /:id/split — Dividir una cuenta abierta en dos ───────────────
// Mueve los itemIds seleccionados a una NUEVA orden (hermana, misma mesa y
// contexto) y deja el resto en la original. El descuento se queda en la
// original (no se prorratea). No se permite mover todos los items. Mismo
// rol que merge/transfer.
async function splitOrderHandler(req, res) {
  try {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const itemIds = Array.isArray(req.body?.itemIds) ? req.body.itemIds.map(String) : [];
    if (itemIds.length === 0) {
      return res.status(400).json({ error: 'Selecciona al menos un producto' });
    }

    const source = await prisma.order.findFirst({
      where: { id, restaurantId },
      include: { items: true },
    });
    if (!source) return res.status(404).json({ error: 'Orden no encontrada' });
    if (['DELIVERED', 'CANCELLED'].includes(source.status)) {
      return res.status(400).json({ error: 'La orden está cerrada' });
    }
    if (source.paymentStatus === 'PAID') {
      return res.status(400).json({ error: 'La orden ya está pagada' });
    }

    const sourceItemIds = new Set(source.items.map((i) => i.id));
    const moving = [...new Set(itemIds)].filter((iid) => sourceItemIds.has(iid));
    if (moving.length === 0) {
      return res.status(400).json({ error: 'Los productos no pertenecen a esta orden' });
    }
    if (moving.length >= source.items.length) {
      return res.status(400).json({ error: 'Deja al menos un producto en la cuenta original' });
    }

    const recalc = (tx, orderId, baseDiscount, baseDelivery) =>
      tx.orderItem
        .findMany({ where: { orderId }, select: { subtotal: true } })
        .then((its) => {
          const sub = its.reduce((s, i) => s + (i.subtotal || 0), 0);
          const tot = sub - (baseDiscount || 0) + (baseDelivery || 0);
          return tx.order.update({ where: { id: orderId }, data: { subtotal: sub, total: tot } });
        });

    const result = await prisma.$transaction(async (tx) => {
      // El split genera un ticket nuevo → consume su propio folio de la serie.
      const orderNumber = await nextOrderNumber(tx, source.restaurantId);

      const created = await tx.order.create({
        data: {
          restaurantId: source.restaurantId,
          locationId: source.locationId,
          orderNumber,
          orderType: source.orderType,
          status: source.status,
          paymentMethod: source.paymentMethod,
          paymentStatus: 'PENDING',
          tableId: source.tableId,
          tableNumber: source.tableNumber,
          numberOfGuests: source.numberOfGuests,
          customerName: source.customerName,
          customerPhone: source.customerPhone,
          source: source.source,
          shiftId: source.shiftId,
          createdById: req.user?.id || null,
          ticketName: source.ticketName ? `${source.ticketName} (2)` : null,
          subtotal: 0,
          discount: 0,
          deliveryFee: 0,
          total: 0,
        },
      });

      await tx.orderItem.updateMany({
        where: { orderId: id, id: { in: moving } },
        data: { orderId: created.id },
      });

      // Descuento/envío se quedan en la original; la nueva arranca limpia.
      await recalc(tx, id, source.discount, source.deliveryFee);
      await recalc(tx, created.id, 0, 0);

      const [srcFull, createdFull] = await Promise.all([
        tx.order.findUnique({ where: { id }, include: ORDER_DETAIL_INCLUDE }),
        tx.order.findUnique({ where: { id: created.id }, include: ORDER_DETAIL_INCLUDE }),
      ]);
      return { source: srcFull, created: createdFull };
    });

    const io = req.app.get('io');
    if (io && result.created?.locationId) {
      const room = `restaurant:${restaurantId}:location:${result.created.locationId}:admins`;
      io.to(room).emit('order:updated', result.source);
      io.to(room).emit('order:created', result.created);
    }

    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

router.post('/:id/split', authenticate, requireTenantAccess, requireOrderMergeRole, splitOrderHandler);

// ── PUT /:id/void-payment — Anular un cobro (solo ADMIN) ──────────────
// Revierte un pago marcado como PAID: deja la orden como pendiente de cobro
// y conserva una nota de auditoría con el nombre del admin que anuló.
router.put('/:id/void-payment', authenticate, requireTenantAccess, requirePermission('reopen_table'), async (req, res) => {
  try {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.restaurantId;

    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Orden no encontrada' });
    if (existing.restaurantId !== restaurantId) {
      return res.status(403).json({ error: 'La orden pertenece a otro restaurante' });
    }
    if (existing.paymentStatus !== 'PAID') {
      return res.status(400).json({ error: 'La orden no está pagada' });
    }

    // Registrar auditoría en `notes` — el schema no tiene un log dedicado
    // para anulaciones de pago, así que preservamos la traza aquí.
    const voidedBy =
      req.user?.name || req.user?.email || `empleado#${req.user?.id}`;
    const stamp = new Date().toISOString();
    const auditNote = `[Cobro anulado por ${voidedBy} el ${stamp}]`;
    const notes = existing.notes ? `${existing.notes}\n${auditNote}` : auditNote;

    const updated = await prisma.order.update({
      where: { id },
      data: {
        paymentStatus: 'PENDING',
        cashCollected: false,
        cashCollectedAt: null,
        cashCollectedBy: null,
        paidAt: null,
        paymentMethod: 'PENDING',
        notes,
      },
      include: {
        user: { select: { name: true, phone: true } },
        items: { include: { menuItem: { select: { name: true, categoryId: true } } } },
      }
    });

    const io = req.app.get('io');
    if (io && existing.locationId) {
      io.to(`restaurant:${restaurantId}:location:${existing.locationId}:admins`)
        .emit('order:updated', updated);
    }

    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /:id/correct-payment-method ───────────────────────────────────────
// Corrige el MÉTODO de pago de una orden YA pagada sin reabrir el cobro. Caso
// típico: el repartidor cobró en efectivo pero quedó registrado como
// transferencia (o viceversa). El total NO se recalcula; solo cambia el método
// y se reconcilia la caja del repartidor en la MISMA transacción:
//   · pasa a CASH  → crea el movimiento DELIVERY/INCOME ligado a la orden (si
//                    no existe) para que ese efectivo entre a su corte.
//   · deja de ser CASH → borra ese movimiento, PERO solo si aún no está
//                    aprobado: un corte ya cerrado es intocable (se reporta
//                    `cashAdjusted: 'locked'` para avisar al operador).
// Misma sensibilidad que void-payment ⇒ mismo permiso (reopen_table).
const CORRECTABLE_PAYMENT_METHODS = new Set(['CASH', 'TRANSFER', 'CARD', 'OTHER']);
router.put('/:id/correct-payment-method', authenticate, requireTenantAccess, requirePermission('reopen_table'), async (req, res) => {
  try {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const newMethod = String(req.body?.paymentMethod || '').toUpperCase();
    if (!CORRECTABLE_PAYMENT_METHODS.has(newMethod)) {
      return res.status(400).json({ error: 'Método de pago inválido' });
    }

    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Orden no encontrada' });
    if (existing.restaurantId !== restaurantId) {
      return res.status(403).json({ error: 'La orden pertenece a otro restaurante' });
    }
    if (existing.paymentStatus !== 'PAID') {
      return res.status(400).json({ error: 'Solo se corrige el método de una orden ya pagada' });
    }
    if (existing.paymentMethod === newMethod) {
      return res.status(400).json({ error: 'La orden ya tiene ese método de pago' });
    }

    const wasCash = existing.paymentMethod === 'CASH';
    const willBeCash = newMethod === 'CASH';
    const correctedBy =
      req.user?.name || req.user?.email || `empleado#${req.user?.id}`;
    const stamp = new Date().toISOString();
    const auditNote = `[Método de pago corregido de ${existing.paymentMethod || '—'} a ${newMethod} por ${correctedBy} el ${stamp}]`;
    const notes = existing.notes ? `${existing.notes}\n${auditNote}` : auditNote;

    // 'created' | 'exists' | 'removed' | 'locked' | null — para que la UI avise.
    let cashAdjusted = null;

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { id },
        data: {
          paymentMethod: newMethod,
          // El efectivo se marca como cobrado; al dejar de ser efectivo se limpia
          // el rastro de cobro en mano (no aplica para transferencia/tarjeta).
          cashCollected: willBeCash,
          cashCollectedAt: willBeCash ? (existing.cashCollectedAt || new Date()) : null,
          cashCollectedBy: willBeCash ? existing.cashCollectedBy : null,
          notes,
        },
        include: {
          user: { select: { name: true, phone: true } },
          items: { include: { menuItem: { select: { name: true, categoryId: true } } } },
        },
      });

      // Reconciliar la caja SOLO si la orden tiene repartidor asignado.
      if (existing.deliveryDriverId) {
        const movement = await tx.driverCashMovement.findFirst({
          where: {
            driverId: existing.deliveryDriverId,
            orderId: id,
            category: 'DELIVERY',
            type: 'INCOME',
          },
        });
        if (willBeCash && !wasCash) {
          if (movement) {
            cashAdjusted = 'exists';
          } else {
            await tx.driverCashMovement.create({
              data: {
                driverId: existing.deliveryDriverId,
                type: 'INCOME',
                category: 'DELIVERY',
                amount: Number(existing.total) || 0,
                description: `Corrección a efectivo · ${existing.orderNumber || id}`,
                orderId: id,
              },
            });
            cashAdjusted = 'created';
          }
        } else if (!willBeCash && wasCash && movement) {
          if (movement.approved) {
            // Corte ya cerrado: no tocamos un período liquidado.
            cashAdjusted = 'locked';
          } else {
            await tx.driverCashMovement.delete({ where: { id: movement.id } });
            cashAdjusted = 'removed';
          }
        }
      }

      return order;
    });

    const io = req.app.get('io');
    if (io && existing.locationId) {
      io.to(`restaurant:${restaurantId}:location:${existing.locationId}:admins`)
        .emit('order:updated', updated);
    }

    res.json({ order: updated, cashAdjusted });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CHAT DE PEDIDO (requiere auth + tenant scope) ─────────────────────────

router.get('/:id/messages', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) {
      return res.status(400).json({ error: 'Restaurante no identificado' });
    }

    // Verifica que la orden existe y pertenece al tenant antes de exponer chat.
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, restaurantId },
      select: { id: true },
    });
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    const messages = await prisma.deliveryMessage.findMany({
      where: { orderId: req.params.id },
      orderBy: { createdAt: 'asc' }
    });
    res.json(messages);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/messages', authenticate, requireTenantAccess, validateBody(messageSchema), async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) {
      return res.status(400).json({ error: 'Restaurante no identificado' });
    }

    const order = await prisma.order.findFirst({
      where: { id: req.params.id, restaurantId },
      select: { id: true },
    });
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    const { message, fromDriver } = req.body;

    const msg = await prisma.deliveryMessage.create({
      data: { orderId: req.params.id, message: message.trim(), fromDriver: fromDriver || false }
    });
    res.json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
// Exportar discountInventory para tests E2E sin levantar el servidor HTTP.
module.exports.discountInventory = discountInventory;
module.exports.restoreInventoryForCancelledOrder = restoreInventoryForCancelledOrder;
