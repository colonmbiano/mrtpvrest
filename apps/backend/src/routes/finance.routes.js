// routes/finance.routes.js
// Módulo FINANCE — food cost real-time, variance, menu engineering,
// histórico de precios y dashboard ejecutivo. Gated por requireModule('FINANCE').
//
// Todos los endpoints filtran por restaurantId del JWT (multi-tenant) y, cuando
// aplica, por locationId del header x-location-id. Devuelven 403 si el módulo
// no está activado en el plan o no está toggled-on por el tenant.

const express = require('express')
const router = express.Router()
const { prisma } = require('@mrtpvrest/database')
const {
  authenticate,
  requireAdmin,
  requireTenantAccess,
} = require('../middleware/auth.middleware')
const requireModule = require('../middleware/module.middleware')

router.use(authenticate, requireTenantAccess, requireAdmin, requireModule('FINANCE'))

// ── Helpers ──────────────────────────────────────────────────────────────

function parseRange(req) {
  // Default: últimos 30 días si no se pasa rango.
  const now = new Date()
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const from = req.query.from ? new Date(String(req.query.from)) : defaultFrom
  const to = req.query.to ? new Date(String(req.query.to)) : now
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return { from: defaultFrom, to: now, invalid: true }
  }
  return { from, to, invalid: false }
}

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

// Calcula el costo "teórico" de una receta sumando RecipeItem.qty * Ingredient.cost
// (incluyendo subrecetas, recursivamente con depth limitado por seguridad).
async function computeRecipeCost(menuItemId, opts = {}) {
  const depth = opts.depth ?? 0
  if (depth > 4) return 0 // evita ciclos infinitos en subrecetas mal armadas

  // Receta nueva (Recipe -> RecipeItem) o legacy (RecipeItem -> menuItemId).
  const items = await prisma.recipeItem.findMany({
    where: {
      OR: [
        { menuItemId },
        { recipe: { menuItemId } },
      ],
    },
    select: {
      quantity: true,
      wastagePercent: true,
      ingredient: { select: { id: true, cost: true } },
      subRecipe: {
        select: {
          id: true,
          items: {
            select: {
              quantity: true,
              wastagePercent: true,
              ingredient: { select: { id: true, cost: true } },
            },
          },
        },
      },
    },
  })

  let total = 0
  for (const it of items) {
    const wastage = 1 + (Number(it.wastagePercent) || 0) / 100
    if (it.ingredient) {
      total += (Number(it.quantity) || 0) * (Number(it.ingredient.cost) || 0) * wastage
    } else if (it.subRecipe) {
      // Costo unitario de la subreceta = suma de sus items / 1 (yield = 1 por ahora).
      let subCost = 0
      for (const si of it.subRecipe.items) {
        const sw = 1 + (Number(si.wastagePercent) || 0) / 100
        subCost += (Number(si.quantity) || 0) * (Number(si.ingredient?.cost) || 0) * sw
      }
      total += (Number(it.quantity) || 0) * subCost * wastage
    }
  }
  return total
}

function safeDiv(a, b) {
  return b > 0 ? a / b : 0
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/finance/dishes — Food cost y margen por menu item
// ─────────────────────────────────────────────────────────────────────────
router.get('/dishes', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId
    const locationId = req.headers['x-location-id'] || req.query.locationId || null
    const categoryId = req.query.categoryId || null
    const { from, to } = parseRange(req)

    const menuItems = await prisma.menuItem.findMany({
      where: {
        restaurantId,
        ...(categoryId ? { categoryId } : {}),
      },
      select: {
        id: true,
        name: true,
        price: true,
        categoryId: true,
        category: { select: { id: true, name: true } },
        recipeItems: { select: { id: true } },
        recipe: { select: { id: true } },
      },
      orderBy: { name: 'asc' },
    })

    // Ventas en el rango — agrupamos por menuItemId. Sólo órdenes PAID.
    const sold = await prisma.orderItem.groupBy({
      by: ['menuItemId'],
      where: {
        order: {
          restaurantId,
          ...(locationId ? { locationId } : {}),
          paymentStatus: 'PAID',
          paidAt: { gte: from, lte: to },
        },
      },
      _sum: { quantity: true, subtotal: true },
    })
    const soldByItem = new Map(sold.map(s => [s.menuItemId, s]))

    const dishes = []
    let dishesWithoutRecipe = 0
    let totalRevenueAll = 0
    let weightedFoodCostPct = 0
    let weightedMarginPct = 0

    for (const mi of menuItems) {
      const hasRecipe = (mi.recipeItems?.length ?? 0) > 0 || mi.recipe != null
      if (!hasRecipe) dishesWithoutRecipe++

      const foodCost = hasRecipe ? await computeRecipeCost(mi.id) : 0
      const foodCostPct = safeDiv(foodCost, mi.price) * 100
      const margin = mi.price - foodCost
      const marginPct = safeDiv(margin, mi.price) * 100

      const s = soldByItem.get(mi.id)
      const unitsSold = Number(s?._sum?.quantity ?? 0)
      const revenue = Number(s?._sum?.subtotal ?? unitsSold * mi.price)
      const totalMargin = unitsSold * margin

      totalRevenueAll += revenue
      weightedFoodCostPct += foodCostPct * revenue
      weightedMarginPct += marginPct * revenue

      dishes.push({
        id: mi.id,
        name: mi.name,
        price: mi.price,
        categoryId: mi.categoryId,
        categoryName: mi.category?.name ?? null,
        foodCost,
        foodCostPct,
        margin,
        marginPct,
        unitsSold,
        revenue,
        totalMargin,
        hasRecipe,
      })
    }

    res.json({
      dishes,
      summary: {
        avgFoodCostPct: totalRevenueAll > 0 ? weightedFoodCostPct / totalRevenueAll : 0,
        avgMarginPct: totalRevenueAll > 0 ? weightedMarginPct / totalRevenueAll : 0,
        dishesWithoutRecipe,
        totalDishes: menuItems.length,
      },
      range: { from, to },
    })
  } catch (e) {
    console.error('[finance] GET /dishes error:', e)
    res.status(500).json({ error: 'Error calculando food cost', detail: e.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────
// GET /api/finance/menu-engineering — Matriz Kasavana-Smith
// ─────────────────────────────────────────────────────────────────────────
router.get('/menu-engineering', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId
    const locationId = req.headers['x-location-id'] || req.query.locationId || null
    const { from, to } = parseRange(req)

    // Reusar la lógica de /dishes inline para no hacer 2 round-trips.
    const menuItems = await prisma.menuItem.findMany({
      where: { restaurantId },
      select: { id: true, name: true, price: true },
    })

    const sold = await prisma.orderItem.groupBy({
      by: ['menuItemId'],
      where: {
        order: {
          restaurantId,
          ...(locationId ? { locationId } : {}),
          paymentStatus: 'PAID',
          paidAt: { gte: from, lte: to },
        },
      },
      _sum: { quantity: true },
    })
    const soldByItem = new Map(sold.map(s => [s.menuItemId, Number(s._sum.quantity ?? 0)]))

    const dishes = []
    for (const mi of menuItems) {
      const cost = await computeRecipeCost(mi.id)
      const margin = mi.price - cost
      const units = soldByItem.get(mi.id) || 0
      dishes.push({ id: mi.id, name: mi.name, price: mi.price, cost, margin, unitsSold: units })
    }

    // Sólo se considera para los umbrales los platos con ventas > 0.
    const active = dishes.filter(d => d.unitsSold > 0)
    const avgMargin = active.length > 0 ? active.reduce((s, d) => s + d.margin, 0) / active.length : 0
    const avgUnitsSold = active.length > 0 ? active.reduce((s, d) => s + d.unitsSold, 0) / active.length : 0

    const matrix = { STAR: [], PLOWHORSE: [], PUZZLE: [], DOG: [] }
    const recommendations = []

    for (const d of dishes) {
      const highMargin = d.margin >= avgMargin
      const highPop = d.unitsSold >= avgUnitsSold
      let type
      if (highMargin && highPop) type = 'STAR'
      else if (!highMargin && highPop) type = 'PLOWHORSE'
      else if (highMargin && !highPop) type = 'PUZZLE'
      else type = 'DOG'
      matrix[type].push({ ...d, type })

      const action = type === 'STAR'
        ? 'Mantener destacado en carta. Defender precio.'
        : type === 'PLOWHORSE'
        ? 'Subir precio o reducir food cost.'
        : type === 'PUZZLE'
        ? 'Promocionar / rediseñar nombre o foto.'
        : 'Considerar retirar de carta.'
      recommendations.push({ dishId: d.id, name: d.name, type, action })
    }

    res.json({
      matrix,
      thresholds: { avgMargin, avgUnitsSold },
      recommendations,
      range: { from, to },
    })
  } catch (e) {
    console.error('[finance] GET /menu-engineering error:', e)
    res.status(500).json({ error: 'Error calculando menu engineering', detail: e.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────
// GET /api/finance/variance — Teórico vs Real por ingrediente
// ─────────────────────────────────────────────────────────────────────────
// Teórico: Σ(OrderItem.quantity × RecipeItem.quantity) para órdenes PAID.
// Real:    Σ(|delta|) de StockMovement con reason ∈ consumo (SALE, WASTE,
//          ADJUSTMENT, PHYSICAL_COUNT) en el rango.
router.get('/variance', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId
    const locationId = req.headers['x-location-id'] || req.query.locationId || null
    const { from, to } = parseRange(req)

    // 1) Ingredientes del restaurante (filtrados por location si aplica).
    const ingredients = await prisma.ingredient.findMany({
      where: {
        restaurantId,
        ...(locationId ? { locationId } : {}),
      },
      select: { id: true, name: true, unit: true, baseUnit: true, cost: true, locationId: true },
    })
    const byId = new Map(ingredients.map(i => [i.id, i]))

    // 2) Teórico: ventas en rango × receta. Usamos OrderItem (PAID) y multiplicamos
    //    por cada RecipeItem. Single big query con groupBy en JS para mantenerlo simple.
    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          restaurantId,
          ...(locationId ? { locationId } : {}),
          paymentStatus: 'PAID',
          paidAt: { gte: from, lte: to },
        },
      },
      select: { menuItemId: true, quantity: true },
    })

    // Agrupar por menuItem para reducir tamaño de cálculo.
    const menuCounts = new Map()
    for (const oi of orderItems) {
      menuCounts.set(oi.menuItemId, (menuCounts.get(oi.menuItemId) || 0) + (oi.quantity || 0))
    }

    // Cargar recipes/items para todos los menuItems vendidos.
    const menuItemIds = Array.from(menuCounts.keys())
    const recipeItems = menuItemIds.length === 0 ? [] : await prisma.recipeItem.findMany({
      where: {
        OR: [
          { menuItemId: { in: menuItemIds } },
          { recipe: { menuItemId: { in: menuItemIds } } },
        ],
      },
      select: {
        menuItemId: true,
        recipe: { select: { menuItemId: true } },
        ingredientId: true,
        quantity: true,
        wastagePercent: true,
        // subreceta — expandimos a sus ingredients
        subRecipe: {
          select: {
            items: { select: { ingredientId: true, quantity: true, wastagePercent: true } },
          },
        },
      },
    })

    const theoreticalByIngredient = new Map() // ingredientId -> qty consumida en baseUnit
    for (const ri of recipeItems) {
      const mid = ri.menuItemId ?? ri.recipe?.menuItemId
      if (!mid) continue
      const sold = menuCounts.get(mid) || 0
      if (sold === 0) continue
      const wastage = 1 + (Number(ri.wastagePercent) || 0) / 100
      if (ri.ingredientId) {
        const q = sold * Number(ri.quantity || 0) * wastage
        theoreticalByIngredient.set(
          ri.ingredientId,
          (theoreticalByIngredient.get(ri.ingredientId) || 0) + q,
        )
      } else if (ri.subRecipe) {
        for (const si of ri.subRecipe.items) {
          if (!si.ingredientId) continue
          const sw = 1 + (Number(si.wastagePercent) || 0) / 100
          const q = sold * Number(ri.quantity || 0) * Number(si.quantity || 0) * wastage * sw
          theoreticalByIngredient.set(
            si.ingredientId,
            (theoreticalByIngredient.get(si.ingredientId) || 0) + q,
          )
        }
      }
    }

    // 3) Real: StockMovement con reason de consumo en el rango.
    const movements = await prisma.stockMovement.groupBy({
      by: ['ingredientId'],
      where: {
        ingredient: {
          restaurantId,
          ...(locationId ? { locationId } : {}),
        },
        ...(locationId ? { locationId } : {}),
        reason: { in: ['SALE', 'WASTE', 'ADJUSTMENT', 'PHYSICAL_COUNT'] },
        createdAt: { gte: from, lte: to },
      },
      _sum: { delta: true },
    })
    // delta para consumo es negativo → tomamos valor absoluto como "real consumido"
    const realByIngredient = new Map()
    for (const m of movements) {
      const consumed = Math.max(0, -Number(m._sum.delta ?? 0)) // si delta<0, consumed = |delta|
      // si hubo ajuste positivo (entrada por ADJUSTMENT) lo ignoramos en consumo real
      realByIngredient.set(m.ingredientId, consumed)
    }

    // 4) Unir y armar respuesta
    const variances = []
    let totalCostImpact = 0
    const allIds = new Set([
      ...theoreticalByIngredient.keys(),
      ...realByIngredient.keys(),
    ])
    for (const id of allIds) {
      const ing = byId.get(id)
      if (!ing) continue // ingrediente de otra location/restaurant
      const theoretical = theoreticalByIngredient.get(id) || 0
      const actual = realByIngredient.get(id) || 0
      const variance = actual - theoretical
      const variancePct = theoretical > 0 ? (variance / theoretical) * 100 : (actual > 0 ? 100 : 0)
      const costImpact = variance * (Number(ing.cost) || 0)
      const absPct = Math.abs(variancePct)
      const severity = absPct < 5 ? 'OK' : absPct <= 15 ? 'WATCH' : 'ALERT'

      variances.push({
        ingredientId: id,
        name: ing.name,
        unit: ing.unit,
        baseUnit: ing.baseUnit,
        theoretical,
        actual,
        variance,
        variancePct,
        costImpact,
        severity,
      })
      totalCostImpact += costImpact
    }

    // Top primero: más impacto en $
    variances.sort((a, b) => Math.abs(b.costImpact) - Math.abs(a.costImpact))

    res.json({ variances, totalCostImpact, range: { from, to } })
  } catch (e) {
    console.error('[finance] GET /variance error:', e)
    res.status(500).json({ error: 'Error calculando variance', detail: e.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────
// GET /api/finance/cost-history/:ingredientId — Time-series de costo
// ─────────────────────────────────────────────────────────────────────────
router.get('/cost-history/:ingredientId', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId
    const ingredient = await prisma.ingredient.findFirst({
      where: { id: req.params.ingredientId, restaurantId },
      select: { id: true, name: true, unit: true, baseUnit: true, cost: true },
    })
    if (!ingredient) return res.status(404).json({ error: 'Ingrediente no encontrado' })

    const history = await prisma.ingredientCostHistory.findMany({
      where: { ingredientId: ingredient.id },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, cost: true, purchaseCost: true, reason: true, changedBy: true },
    })

    // Cambio % en 30 días
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const old = [...history].reverse().find(h => h.createdAt <= cutoff) || history[0]
    const oldCost = old ? Number(old.cost) : Number(ingredient.cost)
    const currentCost = Number(ingredient.cost)
    const changePct30d = oldCost > 0 ? ((currentCost - oldCost) / oldCost) * 100 : 0

    // Platos afectados: que usen este ingrediente
    const affecting = await prisma.recipeItem.findMany({
      where: {
        OR: [
          { ingredientId: ingredient.id },
          { subRecipe: { items: { some: { ingredientId: ingredient.id } } } },
        ],
      },
      select: {
        menuItemId: true,
        recipe: { select: { menuItemId: true, menuItem: { select: { id: true, name: true, price: true } } } },
        menuItem: { select: { id: true, name: true, price: true } },
      },
    })
    const seen = new Set()
    const affectedDishes = []
    for (const ri of affecting) {
      const mi = ri.menuItem || ri.recipe?.menuItem
      if (!mi || seen.has(mi.id)) continue
      seen.add(mi.id)
      // Impacto aproximado: %∆cost del ingrediente × peso del ingrediente en el food cost del plato
      const fc = await computeRecipeCost(mi.id)
      const marginNow = mi.price - fc
      const marginOld = mi.price - fc * (oldCost > 0 ? oldCost / currentCost : 1)
      const marginImpactPct = mi.price > 0 ? ((marginNow - marginOld) / mi.price) * 100 : 0
      affectedDishes.push({ menuItemId: mi.id, name: mi.name, marginImpactPct })
    }

    res.json({
      ingredientId: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
      baseUnit: ingredient.baseUnit,
      history,
      currentCost,
      changePct30d,
      affectedDishes,
    })
  } catch (e) {
    console.error('[finance] GET /cost-history error:', e)
    res.status(500).json({ error: 'Error obteniendo histórico', detail: e.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────
// GET /api/finance/summary — KPIs del dashboard /centro/resumen
// ─────────────────────────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId
    const locationId = req.headers['x-location-id'] || req.query.locationId || null

    const now = new Date()
    const todayFrom = startOfDay(now)
    const todayTo = endOfDay(now)
    const yestFrom = startOfDay(new Date(now.getTime() - 24 * 60 * 60 * 1000))
    const yestTo = endOfDay(new Date(now.getTime() - 24 * 60 * 60 * 1000))
    const from30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // ── HOY ──
    const todayOrders = await prisma.order.findMany({
      where: {
        restaurantId,
        ...(locationId ? { locationId } : {}),
        paymentStatus: 'PAID',
        paidAt: { gte: todayFrom, lte: todayTo },
      },
      select: {
        id: true,
        total: true,
        items: { select: { quantity: true, costSnapshot: true, menuItemId: true, price: true } },
      },
    })

    async function computeOrdersStats(orders) {
      let revenue = 0
      let foodCost = 0
      let ordersCount = orders.length
      // Caché de costos calculados de receta para menu items sin costSnapshot
      const costCache = new Map()
      for (const o of orders) {
        revenue += Number(o.total || 0)
        for (const oi of o.items) {
          if (oi.costSnapshot != null) {
            foodCost += Number(oi.costSnapshot) * Number(oi.quantity || 0)
          } else {
            let c = costCache.get(oi.menuItemId)
            if (c === undefined) {
              c = await computeRecipeCost(oi.menuItemId)
              costCache.set(oi.menuItemId, c)
            }
            foodCost += c * Number(oi.quantity || 0)
          }
        }
      }
      const margin = revenue - foodCost
      return {
        revenue,
        foodCost,
        margin,
        foodCostPct: revenue > 0 ? (foodCost / revenue) * 100 : 0,
        marginPct: revenue > 0 ? (margin / revenue) * 100 : 0,
        ordersCount,
        avgTicket: ordersCount > 0 ? revenue / ordersCount : 0,
      }
    }

    const today = await computeOrdersStats(todayOrders)

    const yestOrders = await prisma.order.findMany({
      where: {
        restaurantId,
        ...(locationId ? { locationId } : {}),
        paymentStatus: 'PAID',
        paidAt: { gte: yestFrom, lte: yestTo },
      },
      select: {
        id: true, total: true,
        items: { select: { quantity: true, costSnapshot: true, menuItemId: true } },
      },
    })
    const yesterday = await computeOrdersStats(yestOrders)

    // ── 30D ──
    const last30Orders = await prisma.order.findMany({
      where: {
        restaurantId,
        ...(locationId ? { locationId } : {}),
        paymentStatus: 'PAID',
        paidAt: { gte: from30, lte: now },
      },
      select: {
        total: true,
        items: { select: { quantity: true, costSnapshot: true, menuItemId: true } },
      },
    })
    const last30 = await computeOrdersStats(last30Orders)

    // Top variance ingredients en 30d
    const varianceResp = await (async () => {
      // Inline llamada lite: replicamos lógica core de /variance pero acotada al top 3 por costImpact.
      const ingredients = await prisma.ingredient.findMany({
        where: { restaurantId, ...(locationId ? { locationId } : {}) },
        select: { id: true, name: true, cost: true },
      })
      const byId = new Map(ingredients.map(i => [i.id, i]))
      const movs = await prisma.stockMovement.groupBy({
        by: ['ingredientId'],
        where: {
          ingredient: { restaurantId, ...(locationId ? { locationId } : {}) },
          ...(locationId ? { locationId } : {}),
          reason: { in: ['SALE', 'WASTE', 'ADJUSTMENT', 'PHYSICAL_COUNT'] },
          createdAt: { gte: from30 },
        },
        _sum: { delta: true },
      })
      const items = movs
        .map(m => {
          const ing = byId.get(m.ingredientId)
          if (!ing) return null
          const consumed = Math.max(0, -Number(m._sum.delta ?? 0))
          const costImpact = consumed * Number(ing.cost || 0)
          return { name: ing.name, costImpact }
        })
        .filter(Boolean)
        .sort((a, b) => Math.abs(b.costImpact) - Math.abs(a.costImpact))
        .slice(0, 3)
      return items
    })()

    // Costos al alza (≥ +10% en 30d, top 5)
    const ingredientsWithHistory = await prisma.ingredient.findMany({
      where: { restaurantId, ...(locationId ? { locationId } : {}) },
      select: {
        id: true,
        name: true,
        cost: true,
        costHistory: {
          where: { createdAt: { lte: from30 } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { cost: true },
        },
      },
    })
    const risingCosts = ingredientsWithHistory
      .map(ing => {
        const old = ing.costHistory?.[0]?.cost
        if (old == null || old <= 0) return null
        const changePct = ((Number(ing.cost) - Number(old)) / Number(old)) * 100
        return { ingredientId: ing.id, name: ing.name, changePct }
      })
      .filter(x => x && x.changePct >= 10)
      .sort((a, b) => b.changePct - a.changePct)
      .slice(0, 5)

    // Alertas — heurística básica
    const alerts = []
    if (today.foodCostPct > 35) {
      alerts.push({
        severity: 'err',
        message: `Food cost del día ${today.foodCostPct.toFixed(1)}% — alto.`,
        cta: { label: 'Ver platos', href: '/centro/platos' },
      })
    }
    if (risingCosts.length > 0) {
      alerts.push({
        severity: 'warn',
        message: `${risingCosts.length} ingrediente(s) con costos al alza >10%.`,
        cta: { label: 'Ver costos', href: '/centro/costos' },
      })
    }
    if (varianceResp.length > 0 && Math.abs(varianceResp[0].costImpact) > 0) {
      alerts.push({
        severity: 'info',
        message: `Variance acumulado en ${varianceResp[0].name} — ${Math.round(Math.abs(varianceResp[0].costImpact))} MXN.`,
        cta: { label: 'Ver variance', href: '/centro/variance' },
      })
    }

    res.json({
      today: {
        revenue: today.revenue,
        foodCost: today.foodCost,
        foodCostPct: today.foodCostPct,
        margin: today.margin,
        marginPct: today.marginPct,
        ordersCount: today.ordersCount,
        avgTicket: today.avgTicket,
      },
      yesterday: {
        revenue: yesterday.revenue,
        foodCostPct: yesterday.foodCostPct,
        marginPct: yesterday.marginPct,
        ordersCount: yesterday.ordersCount,
        avgTicket: yesterday.avgTicket,
      },
      last30d: {
        revenue: last30.revenue,
        foodCostPct: last30.foodCostPct,
        marginPct: last30.marginPct,
        topVarianceIngredients: varianceResp,
        risingCosts,
      },
      alerts,
    })
  } catch (e) {
    console.error('[finance] GET /summary error:', e)
    res.status(500).json({ error: 'Error calculando summary', detail: e.message })
  }
})

module.exports = router
