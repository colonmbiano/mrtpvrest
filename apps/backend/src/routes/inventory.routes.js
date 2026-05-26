const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const { notifyLowStock } = require('../services/notifications.service');
const { recordCostChange } = require('../services/cost-history.service');
const router = express.Router();

// ── PROVEEDORES (Nivel Marca) ─────────────────────────────────────────────

router.get('/suppliers', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId }, // Global por Marca
      orderBy: { name: 'asc' }
    });
    res.json(suppliers);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/suppliers', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const supplier = await prisma.supplier.create({
      data: { ...req.body, restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId }
    });
    res.json(supplier);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/suppliers/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const supplier = await prisma.supplier.update({
      where: { id: req.params.id, restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId },
      data: req.body
    });
    res.json(supplier);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── INGREDIENTES (Nivel Sucursal) ─────────────────────────────────────────

// GET /api/inventory/alerts — ingredientes con stock <= minStock (widget dashboard)
router.get('/alerts', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const items = await prisma.ingredient.findMany({
      where: { locationId, minStock: { gt: 0 } },
      select: { id: true, name: true, unit: true, stock: true, minStock: true },
      orderBy: { name: 'asc' },
    });
    const alerts = items
      .filter(i => i.stock <= i.minStock)
      .sort((a, b) => (a.stock / (a.minStock || 1)) - (b.stock / (b.minStock || 1)));
    res.json(alerts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/ingredients', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const ingredients = await prisma.ingredient.findMany({
      where: { locationId },
      include: {
        supplier: true,
        type: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } },
      },
      orderBy: { name: 'asc' }
    });
    res.json(ingredients);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const VALID_BASE_UNITS = ['GRAM', 'ML', 'PIECE'];

router.post('/ingredients', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId   = req.headers['x-location-id'] || req.query.locationId;
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const {
      name, unit, stock, minStock, supplierId,
      purchaseUnit, purchaseCost, conversionFactor,
      // Nuevos (taxonomía + factor corrección + packaging)
      typeId, categoryId, baseUnit, pesoBruto, pesoNeto, isPackaging, purchaseQty,
    } = req.body;
    const factor = parseFloat(conversionFactor) || 1;
    const cost = purchaseCost ? parseFloat(purchaseCost) / factor : parseFloat(req.body.cost) || 0;
    const ingredient = await prisma.$transaction(async (tx) => {
      const created = await tx.ingredient.create({
        data: {
          restaurantId,
          locationId,
          name,
          unit,
          stock: parseFloat(stock) || 0,
          minStock: parseFloat(minStock) || 0,
          cost,
          purchaseUnit: purchaseUnit || null,
          purchaseQty: purchaseQty != null ? parseFloat(purchaseQty) : 1,
          purchaseCost: purchaseCost ? parseFloat(purchaseCost) : null,
          conversionFactor: factor,
          supplierId: supplierId || null,
          typeId: typeId || null,
          categoryId: categoryId || null,
          baseUnit: VALID_BASE_UNITS.includes(baseUnit) ? baseUnit : 'PIECE',
          pesoBruto: pesoBruto != null ? parseFloat(pesoBruto) : null,
          pesoNeto:  pesoNeto  != null ? parseFloat(pesoNeto)  : null,
          isPackaging: Boolean(isPackaging),
        }
      })
      if (cost > 0 || (purchaseCost != null && parseFloat(purchaseCost) > 0)) {
        await tx.ingredientCostHistory.create({
          data: {
            ingredientId: created.id,
            cost,
            purchaseCost: purchaseCost != null ? parseFloat(purchaseCost) : null,
            purchaseUnit: purchaseUnit || null,
            conversionFactor: factor,
            changedBy: req.user?.id ?? null,
            reason: 'manual_update',
          },
        })
      }
      return created
    });
    res.json(ingredient);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/ingredients/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    const {
      name, unit, stock, minStock, supplierId, purchaseUnit, purchaseCost, conversionFactor,
      typeId, categoryId, baseUnit, pesoBruto, pesoNeto, isPackaging, purchaseQty,
    } = req.body;
    const factor = parseFloat(conversionFactor) || 1;
    const cost = purchaseCost ? parseFloat(purchaseCost) / factor : parseFloat(req.body.cost) || 0;
    const data = {
      ...(name !== undefined && { name }),
      ...(unit !== undefined && { unit }),
      ...(stock !== undefined && { stock: parseFloat(stock) }),
      ...(minStock !== undefined && { minStock: parseFloat(minStock) }),
      ...(supplierId !== undefined && { supplierId: supplierId || null }),
      ...(purchaseUnit !== undefined && { purchaseUnit: purchaseUnit || null }),
      ...(purchaseQty !== undefined && { purchaseQty: parseFloat(purchaseQty) }),
      ...(purchaseCost !== undefined && { purchaseCost: parseFloat(purchaseCost), conversionFactor: factor, cost }),
      ...(purchaseCost === undefined && req.body.cost !== undefined && { cost: parseFloat(req.body.cost) }),
      // Nuevos
      ...(typeId !== undefined && { typeId: typeId || null }),
      ...(categoryId !== undefined && { categoryId: categoryId || null }),
      ...(baseUnit !== undefined && VALID_BASE_UNITS.includes(baseUnit) && { baseUnit }),
      ...(pesoBruto !== undefined && { pesoBruto: pesoBruto === null ? null : parseFloat(pesoBruto) }),
      ...(pesoNeto !== undefined && { pesoNeto: pesoNeto === null ? null : parseFloat(pesoNeto) }),
      ...(isPackaging !== undefined && { isPackaging: Boolean(isPackaging) }),
    };
    const ingredient = await prisma.$transaction(async (tx) => {
      // Registrar cost history ANTES del update — captura el estado anterior
      // y compara contra el nuevo. Si no hay cambio relevante, no inserta nada.
      await recordCostChange(
        tx,
        req.params.id,
        {
          cost: data.cost,
          purchaseCost: data.purchaseCost,
          purchaseUnit: data.purchaseUnit,
          conversionFactor: data.conversionFactor,
        },
        {
          changedBy: req.user?.id ?? null,
          reason: 'manual_update',
        },
      )
      return tx.ingredient.update({
        where: { id: req.params.id, locationId },
        data,
      })
    })
    res.json(ingredient);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Ingrediente no encontrado' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/ingredients/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    await prisma.ingredient.delete({ where: { id: req.params.id, locationId } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Ingrediente no encontrado' });
    res.status(500).json({ error: e.message });
  }
});

router.post('/bulk-confirm', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'No hay ingredientes para confirmar' });

    const results = await Promise.all(items.map(async item => {
      const { name, totalCost, quantityFound, unit } = item;
      const factor = parseFloat(quantityFound) || 1;
      const cost = parseFloat(totalCost) / factor;
      const addedStock = parseFloat(quantityFound) || 0;

      const existing = await prisma.ingredient.findFirst({
        where: { locationId, name: { equals: name, mode: 'insensitive' } }
      });

      if (existing) {
        return prisma.$transaction(async (tx) => {
          await recordCostChange(
            tx,
            existing.id,
            { cost, purchaseCost: parseFloat(totalCost), conversionFactor: factor },
            { changedBy: req.user?.id ?? null, reason: 'bulk_import' },
          )
          return tx.ingredient.update({
            where: { id: existing.id },
            data: {
              cost,
              purchaseCost: parseFloat(totalCost),
              conversionFactor: factor,
              stock: existing.stock + addedStock,
              ...(unit && { unit }),
            },
          })
        })
      }

      // En el create no hay history previo, pero queremos el primer datapoint
      // para que la gráfica de costos arranque desde la primera compra.
      return prisma.$transaction(async (tx) => {
        const created = await tx.ingredient.create({
          data: {
            restaurantId, locationId, name,
            unit: unit || 'pz',
            stock: addedStock,
            minStock: 0,
            cost,
            purchaseCost: parseFloat(totalCost),
            conversionFactor: factor,
          }
        })
        await tx.ingredientCostHistory.create({
          data: {
            ingredientId: created.id,
            cost,
            purchaseCost: parseFloat(totalCost),
            conversionFactor: factor,
            changedBy: req.user?.id ?? null,
            reason: 'bulk_import',
          },
        })
        return created
      })
    }));

    res.json({ ok: true, count: results.length });
  } catch (e) {
    console.error('bulk-confirm error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── MOVIMIENTOS DE INVENTARIO (IN / OUT / ADJUST) ─────────────────────────
//
// Movimientos quedan asociados al ingrediente; el scope por sucursal se
// resuelve via ingredient.locationId. Actualizamos el stock del ingrediente
// atómicamente en la misma transacción.

// Movimientos · ahora leen y escriben StockMovement (libro mayor unificado).
// Mantener la API pública {type, quantity} para no romper el admin UI
// existente — internamente mapeamos:
//   IN     → reason=PURCHASE,    delta=+qty
//   OUT    → reason=ADJUSTMENT,  delta=-qty  (usar /api/waste para mermas)
//   ADJUST → reason=PHYSICAL_COUNT, delta=newStock-oldStock
const MOVEMENT_TYPES = new Set(['IN', 'OUT', 'ADJUST']);

const TYPE_TO_REASON = {
  IN:     'PURCHASE',
  OUT:    'ADJUSTMENT',
  ADJUST: 'PHYSICAL_COUNT',
};

// Vista legacy del shape que la UI vieja esperaba.
function toLegacyMovement(sm) {
  // Inferir el tipo legacy desde el reason.
  let type = 'OUT';
  if (sm.reason === 'PURCHASE') type = 'IN';
  else if (sm.reason === 'PHYSICAL_COUNT') type = 'ADJUST';
  else if (sm.delta > 0) type = 'IN';
  return {
    id: sm.id,
    ingredientId: sm.ingredientId,
    type,
    quantity: Math.abs(Number(sm.delta || 0)),
    reason: sm.notes || sm.reason,
    orderId: sm.refType === 'order' ? sm.refId : null,
    createdAt: sm.createdAt,
    ingredient: sm.ingredient,
  };
}

router.get('/movements', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const take = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const where = { locationId };
    if (req.query.ingredientId) where.ingredientId = String(req.query.ingredientId);
    if (req.query.type) {
      const t = String(req.query.type).toUpperCase();
      if (MOVEMENT_TYPES.has(t)) {
        if (t === 'IN') where.delta = { gt: 0 };
        else if (t === 'OUT') where.delta = { lt: 0 };
        else if (t === 'ADJUST') where.reason = 'PHYSICAL_COUNT';
      }
    }

    const movements = await prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        ingredient: { select: { id: true, name: true, unit: true, stock: true, minStock: true } },
      },
    });
    res.json(movements.map(toLegacyMovement));
  } catch (e) {
    console.error('GET /inventory/movements:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/movements', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    const userId = req.user?.id || null;
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const { ingredientId, type, quantity, reason, orderId } = req.body || {};
    const typeU = String(type || '').toUpperCase();
    const qty = Number(quantity);

    if (!ingredientId) return res.status(400).json({ error: 'ingredientId requerido' });
    if (!MOVEMENT_TYPES.has(typeU)) {
      return res.status(400).json({ error: `type inválido. Valores: ${[...MOVEMENT_TYPES].join(', ')}` });
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ error: 'quantity debe ser un número positivo' });
    }

    const ingredient = await prisma.ingredient.findUnique({
      where: { id: ingredientId },
      select: { id: true, locationId: true, stock: true, minStock: true, name: true, unit: true, baseUnit: true },
    });
    if (!ingredient || ingredient.locationId !== locationId) {
      return res.status(404).json({ error: 'Ingrediente no encontrado en esta sucursal' });
    }

    // Mapear type legacy → delta y nuevo stock.
    let delta;
    if (typeU === 'IN') {
      delta = qty;
    } else if (typeU === 'OUT') {
      if (ingredient.stock - qty < 0) {
        return res.status(409).json({ error: 'Stock insuficiente', current: ingredient.stock });
      }
      delta = -qty;
    } else { // ADJUST: quantity es el stock absoluto nuevo
      delta = qty - Number(ingredient.stock);
    }

    const newStock = Number(ingredient.stock) + delta;

    const [updated, movement] = await prisma.$transaction([
      prisma.ingredient.update({
        where: { id: ingredientId },
        data: { stock: newStock },
        select: { id: true, name: true, unit: true, stock: true, minStock: true },
      }),
      prisma.stockMovement.create({
        data: {
          ingredientId,
          locationId,
          delta,
          unit: ingredient.baseUnit,
          reason: TYPE_TO_REASON[typeU],
          refType: orderId ? 'order' : null,
          refId: orderId || null,
          balanceAfter: newStock,
          userId,
          notes: reason || null,
        },
      }),
    ]);

    const lowStock = updated.minStock > 0 && updated.stock <= updated.minStock;
    if (lowStock) notifyLowStock(updated, locationId).catch(() => {});

    res.status(201).json({ movement: toLegacyMovement({ ...movement, ingredient: updated }), ingredient: updated, lowStock });
  } catch (e) {
    console.error('POST /inventory/movements:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── RECETAS (Nivel Marca) ──────────────────────────────────────────────────

router.get('/recipes/:menuItemId', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const recipes = await prisma.recipeItem.findMany({
      where: {
        menuItemId: req.params.menuItemId,
        menuItem: { restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId }
      },
      include: { ingredient: true }
    });
    res.json(recipes);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SUGGESTED PURCHASE ORDERS ─────────────────────────────────────────────
// Para cada ingrediente activo:
//   consumoDiario = Σ(|delta|) últimos 30d en reasons de consumo / 30
//   diasStock = stock / consumoDiario
//   leadTime = supplier.leadTimeDays
// Si diasStock < leadTime + 2 → sugerir compra
//   qtySugerida = consumoDiario × (leadTime + 7) - stock   (cubrir 7 días extra)
//   urgencia = diasStock < leadTime ? URGENTE : PRONTO
// Agrupado por supplierId. Sin supplier asignado → grupo NULL.

const CONSUMO_REASONS = ['SALE', 'WASTE', 'ADJUSTMENT', 'PHYSICAL_COUNT']
const WINDOW_DAYS = 30
const SAFETY_DAYS = 7

router.get('/purchase-suggestions', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId
    const restaurantId = req.restaurantId || req.user?.restaurantId
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' })
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' })

    const from = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000)

    // 1) Ingredientes activos de la sucursal
    const ingredients = await prisma.ingredient.findMany({
      where: { locationId, isActive: true },
      select: {
        id: true, name: true, stock: true, minStock: true, unit: true, baseUnit: true,
        cost: true, purchaseCost: true, purchaseQty: true, purchaseUnit: true,
        conversionFactor: true,
        supplierId: true,
        supplier: { select: { id: true, name: true, phone: true, leadTimeDays: true, minOrderAmount: true } },
      },
    })

    if (ingredients.length === 0) {
      return res.json({ suggestions: [], generatedAt: new Date(), windowDays: WINDOW_DAYS })
    }

    // 2) Consumo últimos 30d agrupado por ingrediente
    const movs = await prisma.stockMovement.groupBy({
      by: ['ingredientId'],
      where: {
        locationId,
        reason: { in: CONSUMO_REASONS },
        createdAt: { gte: from },
      },
      _sum: { delta: true },
    })
    const consumoByIng = new Map()
    for (const m of movs) {
      const consumed = Math.max(0, -Number(m._sum.delta ?? 0))
      consumoByIng.set(m.ingredientId, consumed)
    }

    // 3) Calcular sugerencias por ingrediente
    const suggestions = []
    for (const ing of ingredients) {
      const consumed30 = consumoByIng.get(ing.id) || 0
      const dailyAvg = consumed30 / WINDOW_DAYS
      if (dailyAvg <= 0) continue // sin consumo histórico, no sugerimos

      const leadTime = ing.supplier?.leadTimeDays ?? 3
      const daysOfStock = dailyAvg > 0 ? Number(ing.stock) / dailyAvg : Infinity

      // Solo sugerimos si va a quedar por debajo de la cobertura mínima
      if (daysOfStock >= leadTime + 2) continue

      // qtySugerida en unidad base
      const targetCoverage = leadTime + SAFETY_DAYS
      const qtyNeededBase = Math.max(0, dailyAvg * targetCoverage - Number(ing.stock))
      if (qtyNeededBase <= 0) continue

      // Convertir a unidad de compra si tiene purchaseQty/conversionFactor
      // Para presentar al usuario en términos de "cajas / bultos" que pide al
      // proveedor: qtyPurchase = qtyBase / conversionFactor
      const factor = Number(ing.conversionFactor) || 1
      const qtyPurchase = factor > 0 ? qtyNeededBase / factor : qtyNeededBase
      // Redondeamos hacia arriba a entero por unidad de compra
      const qtyPurchaseRounded = Math.max(1, Math.ceil(qtyPurchase))
      const unitPrice = Number(ing.purchaseCost ?? (ing.cost * factor)) || 0
      const lineTotal = qtyPurchaseRounded * unitPrice

      suggestions.push({
        ingredient: {
          id: ing.id,
          name: ing.name,
          stock: ing.stock,
          minStock: ing.minStock,
          unit: ing.unit,
          baseUnit: ing.baseUnit,
        },
        supplier: ing.supplier ? {
          id: ing.supplier.id,
          name: ing.supplier.name,
          phone: ing.supplier.phone,
          leadTimeDays: ing.supplier.leadTimeDays,
          minOrderAmount: ing.supplier.minOrderAmount,
        } : null,
        dailyAvgConsumption: dailyAvg,
        daysOfStock: Number.isFinite(daysOfStock) ? daysOfStock : null,
        leadTimeDays: leadTime,
        urgency: daysOfStock < leadTime ? 'URGENTE' : 'PRONTO',
        qtySuggestedBase: qtyNeededBase,
        qtySuggestedPurchase: qtyPurchaseRounded,
        purchaseUnit: ing.purchaseUnit,
        unitPrice,
        lineTotal,
      })
    }

    // 4) Agrupar por supplier
    const groupsMap = new Map()
    for (const s of suggestions) {
      const key = s.supplier?.id ?? '__NO_SUPPLIER__'
      const group = groupsMap.get(key) || {
        supplier: s.supplier,
        items: [],
        urgentCount: 0,
        totalAmount: 0,
      }
      group.items.push(s)
      if (s.urgency === 'URGENTE') group.urgentCount++
      group.totalAmount += s.lineTotal
      groupsMap.set(key, group)
    }

    const groups = Array.from(groupsMap.values())
      // Urgentes primero, después por monto
      .sort((a, b) => (b.urgentCount - a.urgentCount) || (b.totalAmount - a.totalAmount))
      // Marcar si pasa el minOrderAmount del proveedor
      .map(g => ({
        ...g,
        belowMinOrder: g.supplier?.minOrderAmount > 0 && g.totalAmount < g.supplier.minOrderAmount,
      }))

    res.json({
      suggestions: groups,
      generatedAt: new Date(),
      windowDays: WINDOW_DAYS,
      safetyDays: SAFETY_DAYS,
    })
  } catch (e) {
    console.error('GET /inventory/purchase-suggestions:', e)
    res.status(500).json({ error: e.message })
  }
})

// ── MERMAS (WasteLog) ──────────────────────────────────────────────────────
// Cada merma = 1 StockMovement (reason=WASTE, delta negativo) + 1 WasteLog
// (motivo tipado, foto opcional). Se descuenta del stock real del ingrediente
// y queda contabilizada en /api/finance/variance.

const VALID_WASTE_REASONS = new Set([
  'EXPIRED', 'DAMAGED', 'COURTESY', 'OVERPREP',
  'CONTAMINATION', 'STAFF_MEAL', 'TEST_KITCHEN', 'OTHER',
]);

router.get('/waste', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const take = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const fromQuery = req.query.from ? new Date(String(req.query.from)) : null;
    const toQuery = req.query.to ? new Date(String(req.query.to)) : null;

    const wasteLogs = await prisma.wasteLog.findMany({
      where: {
        stockMovement: {
          locationId,
          ...(fromQuery || toQuery
            ? { createdAt: { ...(fromQuery ? { gte: fromQuery } : {}), ...(toQuery ? { lte: toQuery } : {}) } }
            : {}),
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        stockMovement: {
          select: {
            id: true,
            delta: true,
            unit: true,
            unitCostAtMove: true,
            createdAt: true,
            user: { select: { id: true, name: true } },
            ingredient: { select: { id: true, name: true, unit: true, cost: true } },
          },
        },
        approvedByUser: { select: { id: true, name: true } },
      },
    });

    res.json(wasteLogs.map(w => ({
      id: w.id,
      reason: w.reason,
      reasonDetail: w.reasonDetail,
      photoUrl: w.photoUrl,
      createdAt: w.createdAt,
      quantity: Math.abs(Number(w.stockMovement.delta || 0)),
      unit: w.stockMovement.unit,
      ingredient: w.stockMovement.ingredient,
      // costImpact: cantidad * costo unitario (snapshot del movimiento si existe,
      // si no, el costo actual del ingrediente).
      costImpact:
        Math.abs(Number(w.stockMovement.delta || 0)) *
        Number(w.stockMovement.unitCostAtMove ?? w.stockMovement.ingredient?.cost ?? 0),
      registeredBy: w.stockMovement.user,
      approvedBy: w.approvedByUser,
    })));
  } catch (e) {
    console.error('GET /inventory/waste:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/waste', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    const userId = req.user?.id || null;
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const { ingredientId, quantity, reason, reasonDetail, photoUrl } = req.body || {};
    const qty = Number(quantity);
    const reasonU = String(reason || '').toUpperCase();

    if (!ingredientId) return res.status(400).json({ error: 'ingredientId requerido' });
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ error: 'quantity debe ser un número positivo' });
    }
    if (!VALID_WASTE_REASONS.has(reasonU)) {
      return res.status(400).json({ error: `reason inválido. Valores: ${[...VALID_WASTE_REASONS].join(', ')}` });
    }

    const ingredient = await prisma.ingredient.findUnique({
      where: { id: ingredientId },
      select: { id: true, locationId: true, stock: true, baseUnit: true, cost: true, name: true },
    });
    if (!ingredient || ingredient.locationId !== locationId) {
      return res.status(404).json({ error: 'Ingrediente no encontrado en esta sucursal' });
    }
    if (Number(ingredient.stock) - qty < 0) {
      return res.status(409).json({
        error: 'Stock insuficiente para registrar la merma',
        current: ingredient.stock,
      });
    }

    const delta = -qty;
    const newStock = Number(ingredient.stock) + delta;

    const result = await prisma.$transaction(async (tx) => {
      const updatedIng = await tx.ingredient.update({
        where: { id: ingredientId },
        data: { stock: newStock },
        select: { id: true, name: true, unit: true, stock: true, minStock: true },
      });

      const movement = await tx.stockMovement.create({
        data: {
          ingredientId,
          locationId,
          delta,
          unit: ingredient.baseUnit,
          reason: 'WASTE',
          refType: 'wasteLog',
          // refId se actualiza después de crear el WasteLog para apuntar al log,
          // pero como WasteLog es la fuente de verdad y se relaciona via
          // stockMovementId, no es estrictamente necesario.
          balanceAfter: newStock,
          unitCostAtMove: Number(ingredient.cost) || null,
          userId,
          notes: reasonU,
        },
      });

      const wasteLog = await tx.wasteLog.create({
        data: {
          stockMovementId: movement.id,
          reason: reasonU,
          reasonDetail: reasonDetail ? String(reasonDetail).slice(0, 500) : null,
          photoUrl: photoUrl || null,
          approvedByUserId: userId,
        },
      });

      // Si registramos el refId del movement para apuntar al wasteLog, lo
      // hacemos sin romper la 1:1 (wasteLog.stockMovementId sigue intacto).
      await tx.stockMovement.update({
        where: { id: movement.id },
        data: { refId: wasteLog.id },
      });

      return { movement, wasteLog, ingredient: updatedIng };
    });

    const lowStock = result.ingredient.minStock > 0 && result.ingredient.stock <= result.ingredient.minStock;
    if (lowStock) notifyLowStock(result.ingredient, locationId).catch(() => {});

    res.status(201).json({
      id: result.wasteLog.id,
      reason: result.wasteLog.reason,
      quantity: qty,
      unit: result.movement.unit,
      ingredient: result.ingredient,
      costImpact: qty * (Number(ingredient.cost) || 0),
      lowStock,
    });
  } catch (e) {
    console.error('POST /inventory/waste:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
