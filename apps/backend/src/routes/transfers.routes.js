// transfers.routes.js
//
// Reparto de inventario desde la Bodega Central hacia las sucursales.
// Sólo opera cuando RestaurantConfig.centralWarehouseEnabled = true y existe
// una sucursal marcada isCentralWarehouse.
//
// Un reparto crea, en una sola transacción, por cada línea:
//   1. StockMovement TRANSFER_OUT en la Bodega Central (delta negativo)
//   2. StockMovement TRANSFER_IN  en la sucursal destino (delta positivo)
//   3. Ingredient.stock -= qty (central)  /  += qty (sucursal destino)
//   4. StockTransferItem (detalle auditable) + cabecera StockTransfer
//
// El stock total del restaurant se conserva: lo que sale de la central entra
// en las sucursales. Las recetas siguen descontando del stock por sucursal.

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireTenantAccess } = require('../middleware/auth.middleware');
const { requireFeatureFlag } = require('../lib/modules');
const router = express.Router();

router.use(authenticate, requireTenantAccess, requireFeatureFlag('hasInventory', 'Inventario y costeo'));

const ALLOWED_ROLES = ['CASHIER', 'WAITER', 'KITCHEN', 'ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'];

const norm = (s) => String(s || '').trim().toLowerCase();

// Resuelve la Bodega Central activa del restaurant o devuelve un error
// controlado para que el caller responda con el status adecuado.
async function resolveCentral(restaurantId) {
  const config = await prisma.restaurantConfig.findUnique({
    where: { restaurantId },
    select: { centralWarehouseEnabled: true },
  });
  if (!config?.centralWarehouseEnabled) {
    return { error: 'El modelo de Bodega Central no está activado.', code: 'CENTRAL_DISABLED', status: 409 };
  }
  const central = await prisma.location.findFirst({
    where: { restaurantId, isCentralWarehouse: true },
    select: { id: true, name: true },
  });
  if (!central) {
    return { error: 'No hay una sucursal marcada como Bodega Central.', code: 'NO_CENTRAL_LOCATION', status: 409 };
  }
  return { central };
}

// Encuentra (o crea) la fila de ingrediente equivalente en la sucursal
// destino. El catálogo es por sucursal, así que matcheamos por nombre
// normalizado dentro del mismo restaurant.
async function findOrCreateDestIngredient(tx, srcIng, restaurantId, toLocationId) {
  const dest = await tx.ingredient.findFirst({
    where: { restaurantId, locationId: toLocationId, name: { equals: srcIng.name, mode: 'insensitive' } },
    select: { id: true, stock: true, baseUnit: true },
  });
  if (dest) return dest;

  const created = await tx.ingredient.create({
    data: {
      restaurantId,
      locationId: toLocationId,
      name: srcIng.name,
      unit: srcIng.unit,
      baseUnit: srcIng.baseUnit,
      stock: 0,
      minStock: 0,
      cost: srcIng.cost || 0,
      purchaseUnit: srcIng.purchaseUnit,
      purchaseQty: srcIng.purchaseQty,
      purchaseCost: srcIng.purchaseCost,
      conversionFactor: srcIng.conversionFactor,
      isPackaging: srcIng.isPackaging,
    },
    select: { id: true, stock: true, baseUnit: true },
  });
  return created;
}

// ── POST /api/transfers ──────────────────────────────────────────────────
// Body: { items: [{ ingredientId, toLocationId, qty }], notes? }
// ingredientId = fila del catálogo de la Bodega Central.
router.post('/', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const userId       = req.user?.id || null;
    const userRole     = req.user?.role || 'CUSTOMER';

    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    if (!ALLOWED_ROLES.includes(userRole)) {
      return res.status(403).json({ error: 'Rol sin permiso para repartir inventario' });
    }

    const { items, notes } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items requerido (mínimo 1)' });
    }

    const resolved = await resolveCentral(restaurantId);
    if (resolved.error) return res.status(resolved.status).json({ error: resolved.error, code: resolved.code });
    const central = resolved.central;

    // Validar y normalizar líneas
    const normalized = [];
    for (const raw of items) {
      const ingredientId = raw?.ingredientId;
      const toLocationId = raw?.toLocationId;
      const qty = Number(raw?.qty);
      if (!ingredientId) return res.status(400).json({ error: 'línea sin ingredientId' });
      if (!toLocationId) return res.status(400).json({ error: 'línea sin toLocationId' });
      if (toLocationId === central.id) {
        return res.status(400).json({ error: 'El destino no puede ser la propia Bodega Central' });
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ error: `qty inválida para ${ingredientId}` });
      }
      normalized.push({ ingredientId, toLocationId, qty });
    }

    // Las sucursales destino deben pertenecer al restaurant
    const destIds = [...new Set(normalized.map(i => i.toLocationId))];
    const destLocations = await prisma.location.findMany({
      where: { id: { in: destIds }, restaurantId },
      select: { id: true },
    });
    if (destLocations.length !== destIds.length) {
      return res.status(400).json({ error: 'Una o más sucursales destino no pertenecen al restaurant' });
    }

    // Ingredientes origen: deben existir en la Bodega Central
    const srcIds = [...new Set(normalized.map(i => i.ingredientId))];
    const srcIngredients = await prisma.ingredient.findMany({
      where: { id: { in: srcIds }, restaurantId, locationId: central.id },
      select: {
        id: true, name: true, unit: true, baseUnit: true, stock: true, cost: true,
        purchaseUnit: true, purchaseQty: true, purchaseCost: true,
        conversionFactor: true, isPackaging: true,
      },
    });
    if (srcIngredients.length !== srcIds.length) {
      return res.status(400).json({ error: 'Uno o más ingredientes no están en la Bodega Central' });
    }
    const srcMap = new Map(srcIngredients.map(i => [i.id, i]));

    // Validar disponibilidad agregada en la central (suma por ingrediente)
    const neededByIng = new Map();
    for (const it of normalized) {
      neededByIng.set(it.ingredientId, (neededByIng.get(it.ingredientId) || 0) + it.qty);
    }
    for (const [ingId, need] of neededByIng) {
      const src = srcMap.get(ingId);
      if (Number(src.stock) < need) {
        return res.status(409).json({
          error: `Stock insuficiente en Bodega Central para "${src.name}" (disponible ${src.stock}, requiere ${need}).`,
          code: 'INSUFFICIENT_STOCK',
        });
      }
    }

    const totalCost = normalized.reduce((s, it) => {
      const src = srcMap.get(it.ingredientId);
      return s + it.qty * Number(src.cost || 0);
    }, 0);

    const result = await prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.create({
        data: {
          restaurantId,
          fromLocationId: central.id,
          status: 'COMPLETED',
          notes: notes || null,
          totalCost,
          createdById: userId,
          completedAt: new Date(),
        },
      });

      for (const it of normalized) {
        const src = srcMap.get(it.ingredientId);
        const unitCost = Number(src.cost || 0);

        // 1. Salida de la Bodega Central
        const outIng = await tx.ingredient.update({
          where: { id: src.id },
          data: { stock: { decrement: it.qty } },
          select: { stock: true, baseUnit: true },
        });
        await tx.stockMovement.create({
          data: {
            ingredientId: src.id,
            locationId: central.id,
            delta: -it.qty,
            unit: outIng.baseUnit,
            reason: 'TRANSFER_OUT',
            refType: 'stockTransfer',
            refId: transfer.id,
            balanceAfter: Number(outIng.stock),
            unitCostAtMove: unitCost,
            userId,
            notes: `Reparto → sucursal ${it.toLocationId}`,
          },
        });

        // 2. Entrada en la sucursal destino
        const destIng = await findOrCreateDestIngredient(tx, src, restaurantId, it.toLocationId);
        const inIng = await tx.ingredient.update({
          where: { id: destIng.id },
          data: { stock: { increment: it.qty } },
          select: { stock: true, baseUnit: true },
        });
        await tx.stockMovement.create({
          data: {
            ingredientId: destIng.id,
            locationId: it.toLocationId,
            delta: it.qty,
            unit: inIng.baseUnit,
            reason: 'TRANSFER_IN',
            refType: 'stockTransfer',
            refId: transfer.id,
            balanceAfter: Number(inIng.stock),
            unitCostAtMove: unitCost,
            userId,
            notes: `Reparto desde Bodega Central (${central.name})`,
          },
        });

        // 3. Detalle del reparto
        await tx.stockTransferItem.create({
          data: {
            stockTransferId: transfer.id,
            ingredientId: src.id,
            toLocationId: it.toLocationId,
            qty: it.qty,
            unitCostAtMove: unitCost,
          },
        });
      }

      return transfer;
    });

    res.status(201).json(result);
  } catch (e) {
    console.error('POST /api/transfers:', e);
    res.status(500).json({ error: 'Error al registrar reparto: ' + e.message });
  }
});

// ── GET /api/transfers ───────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const { from, to } = req.query;
    const where = { restaurantId };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(String(from));
      if (to)   where.createdAt.lte = new Date(String(to));
    }

    const list = await prisma.stockTransfer.findMany({
      where,
      include: {
        fromLocation: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        items: {
          include: {
            ingredient: { select: { id: true, name: true, baseUnit: true } },
            toLocation: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json(list);
  } catch (e) {
    console.error('GET /api/transfers:', e);
    res.status(500).json({ error: 'Error al listar repartos: ' + e.message });
  }
});

// ── GET /api/transfers/suggestion?toLocationId= ──────────────────────────
// Sugiere qué repartir a una sucursal: ingredientes en o bajo su minStock,
// con cantidad sugerida para llevarlos a ~2x el mínimo, topada por la
// disponibilidad real en la Bodega Central (match por nombre).
router.get('/suggestion', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const toLocationId = String(req.query.toLocationId || '');
    if (!toLocationId) return res.status(400).json({ error: 'toLocationId requerido' });

    const resolved = await resolveCentral(restaurantId);
    if (resolved.error) return res.status(resolved.status).json({ error: resolved.error, code: resolved.code });
    const central = resolved.central;
    if (toLocationId === central.id) {
      return res.status(400).json({ error: 'La sucursal destino no puede ser la Bodega Central' });
    }

    const [destItems, centralItems] = await Promise.all([
      prisma.ingredient.findMany({
        where: { restaurantId, locationId: toLocationId, isActive: true, minStock: { gt: 0 } },
        select: { id: true, name: true, unit: true, stock: true, minStock: true },
      }),
      prisma.ingredient.findMany({
        where: { restaurantId, locationId: central.id, isActive: true },
        select: { id: true, name: true, stock: true, cost: true },
      }),
    ]);

    const centralByName = new Map(centralItems.map(c => [norm(c.name), c]));

    const suggestion = [];
    for (const d of destItems) {
      if (Number(d.stock) > Number(d.minStock)) continue; // sólo lo que está en/bajo mínimo
      const c = centralByName.get(norm(d.name));
      if (!c || Number(c.stock) <= 0) continue; // la central no tiene para repartir
      const target = Number(d.minStock) * 2;
      const want = Math.max(target - Number(d.stock), 0);
      const qty = Math.min(want, Number(c.stock));
      if (qty <= 0) continue;
      suggestion.push({
        centralIngredientId: c.id,
        name: d.name,
        unit: d.unit,
        destStock: Number(d.stock),
        destMinStock: Number(d.minStock),
        centralStock: Number(c.stock),
        suggestedQty: Number(qty.toFixed(3)),
        estimatedCost: Number((qty * Number(c.cost || 0)).toFixed(2)),
      });
    }

    res.json({ toLocationId, central: central.id, list: suggestion });
  } catch (e) {
    console.error('GET /api/transfers/suggestion:', e);
    res.status(500).json({ error: 'Error al calcular sugerencia: ' + e.message });
  }
});

// ── GET /api/transfers/warehouse?locationId= ─────────────────────────────
// Vista de bodega de una sucursal concreta (stock, mínimo, costo y valor).
// Lee locationId del query (no del header de sucursal activa) para poder
// inspeccionar la Bodega Central desde cualquier contexto.
router.get('/warehouse', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const locationId = String(req.query.locationId || '');
    if (!locationId) return res.status(400).json({ error: 'locationId requerido' });

    const loc = await prisma.location.findFirst({
      where: { id: locationId, restaurantId },
      select: { id: true, name: true, isCentralWarehouse: true },
    });
    if (!loc) return res.status(404).json({ error: 'Sucursal no encontrada' });

    const ingredients = await prisma.ingredient.findMany({
      where: { restaurantId, locationId, isActive: true },
      select: {
        id: true, name: true, unit: true, baseUnit: true,
        stock: true, minStock: true, cost: true,
        category: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });

    const rows = ingredients.map(i => ({
      ...i,
      lowStock: i.minStock > 0 && i.stock <= i.minStock,
      value: Number((Number(i.stock) * Number(i.cost || 0)).toFixed(2)),
    }));
    const totalValue = Number(rows.reduce((s, r) => s + r.value, 0).toFixed(2));

    res.json({ location: loc, totalValue, count: rows.length, ingredients: rows });
  } catch (e) {
    console.error('GET /api/transfers/warehouse:', e);
    res.status(500).json({ error: 'Error al cargar bodega: ' + e.message });
  }
});

module.exports = router;
