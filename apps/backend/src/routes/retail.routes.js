const express = require('express');
const { z } = require('zod');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireTenantAccess, requireRole, userHasPermission, hasValidOverride } = require('../middleware/auth.middleware');
const { sendCashCutEmail } = require('../lib/cash-cut-mailer');

const router = express.Router();

const RETAIL_ROLES = ['CASHIER', 'ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'];
const ADMIN_ROLES = ['ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'];

router.use(authenticate, requireTenantAccess, requireRole(...RETAIL_ROLES));

function restaurantIdFrom(req) {
  return req.restaurantId || req.user?.restaurantId;
}

function locationIdFrom(req, explicit) {
  return explicit || req.locationId || req.user?.locationId || null;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function assertPositiveQty(qty, label = 'qty') {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) {
    const err = new Error(`${label} invalida`);
    err.status = 400;
    throw err;
  }
  return n;
}

async function assertLocation(restaurantId, locationId) {
  const location = await prisma.location.findFirst({
    where: { id: locationId, restaurantId, isActive: true },
    select: { id: true, name: true, isCentralWarehouse: true },
  });
  if (!location) {
    const err = new Error('Sucursal retail no encontrada o inactiva');
    err.status = 404;
    throw err;
  }
  return location;
}

async function getOrCreateDevice(tx, restaurantId, locationId, device) {
  if (!device?.deviceKey) return null;
  return tx.retailDevice.upsert({
    where: { restaurantId_deviceKey: { restaurantId, deviceKey: String(device.deviceKey) } },
    create: {
      restaurantId,
      locationId,
      deviceKey: String(device.deviceKey),
      name: String(device.name || 'Caja Windows'),
      platform: String(device.platform || 'WINDOWS'),
      lastSyncAt: new Date(),
    },
    update: {
      restaurantId,
      locationId,
      name: device.name ? String(device.name) : undefined,
      platform: device.platform ? String(device.platform) : undefined,
      isActive: true,
      lastSyncAt: new Date(),
    },
    select: { id: true },
  });
}

// Folio secuencial y CONTINUO por restaurante (R-1, R-2, ...). Mismo patrón
// atómico que lib/order-number.js: el UPDATE toma lock de fila dentro de la tx,
// así el folio hace rollback con la venta y dos cobros simultáneos se serializan
// (N, N+1) en vez de chocar como hacía `R-${Date.now()}`. Serie propia
// ('retail_sale'), independiente del folio de órdenes del restaurante.
async function nextRetailFolio(tx, restaurantId) {
  const scope = 'retail_sale';
  const bumped = await tx.counter.updateMany({
    where: { restaurantId, scope },
    data: { value: { increment: 1 } },
  });
  if (bumped.count > 0) {
    const c = await tx.counter.findFirst({ where: { restaurantId, scope }, select: { value: true } });
    return c.value;
  }
  // Primera venta del restaurante: sembramos desde el histórico de ventas retail.
  const seedBase = await tx.retailSale.count({ where: { restaurantId } });
  try {
    const created = await tx.counter.create({
      data: { restaurantId, scope, value: seedBase + 1 },
      select: { value: true },
    });
    return created.value;
  } catch (e) {
    if (e.code !== 'P2002') throw e;
    // Perdimos la carrera del create → la fila ya existe; incrementamos y leemos.
    await tx.counter.updateMany({ where: { restaurantId, scope }, data: { value: { increment: 1 } } });
    const c = await tx.counter.findFirst({ where: { restaurantId, scope }, select: { value: true } });
    return c.value;
  }
}

// Caja ABIERTA de la sucursal (una a la vez). Las ventas se enlazan a ella para
// que el corte cuadre. Best-effort: si no hay caja abierta, la venta igual se
// registra con shiftId null (retail puede vender sin turno formal).
async function findOpenShiftId(client, restaurantId, locationId) {
  const shift = await client.retailCashShift.findFirst({
    where: { restaurantId, locationId, status: 'OPEN' },
    select: { id: true },
  });
  return shift?.id || null;
}

// Totales EN VIVO de una caja (mismo cálculo que el cierre, sin mutar): ventas
// COMPLETED ligadas al turno por método + movimientos de efectivo + esperado.
// Fuente única compartida por el cierre y por GET /shifts/:id/summary.
async function computeShiftTotals(client, shiftId, openingFloat) {
  const payments = await client.retailPayment.findMany({
    where: { sale: { shiftId, status: 'COMPLETED' } },
    select: { method: true, amount: true },
  });
  const byMethod = payments.reduce((acc, p) => {
    const amt = Number(p.amount);
    if (p.method === 'CASH') acc.cash += amt;
    else if (p.method === 'CARD_PRESENT') acc.card += amt;
    else if (p.method === 'TRANSFER') acc.transfer += amt;
    return acc;
  }, { cash: 0, card: 0, transfer: 0 });
  const salesCount = await client.retailSale.count({ where: { shiftId, status: 'COMPLETED' } });
  const movements = await client.retailCashMovement.findMany({
    where: { shiftId },
    select: { type: true, amount: true },
  });
  const cashIn = movements.filter((m) => m.type === 'CASH_IN').reduce((s, m) => s + Number(m.amount), 0);
  const cashOut = movements.filter((m) => m.type === 'CASH_OUT' || m.type === 'EXPENSE').reduce((s, m) => s + Number(m.amount), 0);
  const expectedCash = Number((Number(openingFloat) + byMethod.cash + cashIn - cashOut).toFixed(2));
  return {
    totalCashSales: Number(byMethod.cash.toFixed(2)),
    totalCardSales: Number(byMethod.card.toFixed(2)),
    totalTransferSales: Number(byMethod.transfer.toFixed(2)),
    totalCashIn: Number(cashIn.toFixed(2)),
    totalCashOut: Number(cashOut.toFixed(2)),
    salesCount,
    expectedCash,
  };
}

const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  gender: z.string().optional(),
  season: z.string().optional(),
  imageUrl: z.string().optional(),
});

// Unidad de venta del SKU. Debe coincidir con UNITS en apps/moda/src/lib/giro.ts.
const UNITS = ['PZA', 'MTS', 'KG', 'LTS', 'CAJA'];

const skuSchema = z.object({
  productId: z.string().min(1),
  sku: z.string().min(1),
  barcode: z.string().optional(),
  size: z.string().optional(),
  color: z.string().optional(),
  material: z.string().optional(),
  style: z.string().optional(),
  price: z.number().nonnegative(),
  cost: z.number().nonnegative().optional(),
  imageUrl: z.string().optional(),
  // Inventario genérico (retail multigiro · Fase 1)
  unitOfMeasure: z.enum(UNITS).optional(),
  unitsPerPackage: z.number().positive().optional(),
  binLocation: z.string().optional(),
  supplierRef: z.string().optional(),
});

const skuUpdateSchema = z.object({
  sku: z.string().min(1).optional(),
  barcode: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  material: z.string().nullable().optional(),
  style: z.string().nullable().optional(),
  price: z.number().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
  // Inventario genérico (retail multigiro · Fase 1). unitOfMeasure no es
  // nullable: la columna es NOT NULL DEFAULT 'PZA'.
  unitOfMeasure: z.enum(UNITS).optional(),
  unitsPerPackage: z.number().positive().nullable().optional(),
  binLocation: z.string().nullable().optional(),
  supplierRef: z.string().nullable().optional(),
});

const saleSchema = z.object({
  locationId: z.string().optional(),
  clientSaleId: z.string().min(6),
  device: z.object({
    deviceKey: z.string().min(4),
    name: z.string().optional(),
    platform: z.string().optional(),
  }).optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  notes: z.string().optional(),
  discount: z.number().optional(),
  tax: z.number().optional(),
  allowNegativeStock: z.boolean().optional(),
  lines: z.array(z.object({
    skuId: z.string(),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative().optional(),
    discount: z.number().nonnegative().optional(),
  })).min(1),
  payments: z.array(z.object({
    method: z.enum(['CASH', 'CARD_PRESENT', 'TRANSFER', 'COURTESY']),
    amount: z.number().nonnegative(),
    reference: z.string().optional(),
  })).min(1),
});

async function createRetailSale(input, req) {
  const restaurantId = restaurantIdFrom(req);
  if (!restaurantId) {
    const err = new Error('Restaurante no identificado');
    err.status = 400;
    throw err;
  }
  const body = saleSchema.parse(input);
  const locationId = locationIdFrom(req, body.locationId);
  if (!locationId) {
    const err = new Error('Sucursal requerida para la venta retail');
    err.status = 400;
    throw err;
  }

  await assertLocation(restaurantId, locationId);

  const existing = await prisma.retailSale.findFirst({
    where: { restaurantId, clientSaleId: body.clientSaleId },
    include: { lines: true, payments: true },
  });
  if (existing) return { sale: existing, idempotent: true };

  const skuIds = [...new Set(body.lines.map((line) => line.skuId))];
  const skus = await prisma.retailSku.findMany({
    where: { restaurantId, id: { in: skuIds }, isActive: true },
    include: { product: true },
  });
  if (skus.length !== skuIds.length) {
    const err = new Error('Uno o mas SKUs no existen o estan inactivos');
    err.status = 400;
    throw err;
  }
  const skuMap = new Map(skus.map((sku) => [sku.id, sku]));

  // Precio por volumen (mayoreo · retail multigiro Fase 3). Se resuelve aquí,
  // server-side, junto al resto del cálculo: el cliente nunca manda precio.
  const tiers = await prisma.retailPriceTier.findMany({
    where: { restaurantId, skuId: { in: skuIds } },
    orderBy: { minQty: 'asc' },
  });
  const tiersBySku = new Map();
  for (const t of tiers) {
    if (!tiersBySku.has(t.skuId)) tiersBySku.set(t.skuId, []);
    tiersBySku.get(t.skuId).push(t);
  }

  // Precio SIEMPRE del catálogo (server-side truth); nunca confiar en el
  // unitPrice del cliente. Aplica el tier de mayor minQty que la cantidad
  // alcance; sin tiers, el precio de lista.
  //
  // Una sola función para todo el archivo A PROPÓSITO: el precio se usa dos
  // veces (el subtotal de la venta y cada RetailSaleLine). Si las dos rutas
  // resolvieran por separado, un tier aplicado en una y no en la otra dejaría
  // el total sin cuadrar contra la suma de sus líneas.
  const priceFor = (sku, quantity) => {
    const applicable = (tiersBySku.get(sku.id) || []).filter((t) => quantity >= Number(t.minQty));
    // Ordenados por minQty asc ⇒ el último aplicable es el de mayor mínimo.
    return applicable.length ? Number(applicable[applicable.length - 1].price) : Number(sku.price);
  };

  const totals = body.lines.reduce((acc, line) => {
    const sku = skuMap.get(line.skuId);
    const price = priceFor(sku, line.quantity);
    const gross = line.quantity * price;
    const discount = Math.min(Math.max(toNumber(line.discount), 0), gross);
    return {
      subtotal: acc.subtotal + (gross - discount),
      cost: acc.cost + line.quantity * Number(sku.cost || 0),
    };
  }, { subtotal: 0, cost: 0 });
  const saleDiscount = Math.min(Math.max(toNumber(body.discount), 0), totals.subtotal);
  const tax = Math.max(toNumber(body.tax), 0);
  const total = Number((totals.subtotal - saleDiscount + tax).toFixed(2));

  // Descuento requiere permiso REAL (apply_discount): el actor lo tiene, es admin,
  // o trae un override token de supervisor. El clamp [0,subtotal] solo evitaba un
  // total negativo, no un descuento NO autorizado de un cliente modificado.
  const anyDiscount = saleDiscount > 0 || body.lines.some((l) => toNumber(l.discount) > 0);
  if (anyDiscount && !(userHasPermission(req, 'apply_discount') || hasValidOverride(req, 'apply_discount'))) {
    const err = new Error('No tienes permiso para aplicar descuentos');
    err.status = 403;
    throw err;
  }

  // Sobreventa (stock negativo) solo para administradores; un cajero NO puede
  // saltarse el control de stock pasando allowNegativeStock.
  const allowNeg = Boolean(body.allowNegativeStock) && ADMIN_ROLES.includes(req.user?.role);

  const paid = body.payments.reduce((sum, p) => sum + toNumber(p.amount), 0);
  if (Math.abs(paid - total) > 0.01) {
    const err = new Error(`Pagos no cuadran con total retail (${paid} vs ${total})`);
    err.status = 400;
    throw err;
  }

  try {
    return await prisma.$transaction(async (tx) => {
    const device = await getOrCreateDevice(tx, restaurantId, locationId, body.device);
    const folio = `R-${await nextRetailFolio(tx, restaurantId)}`;
    const shiftId = await findOpenShiftId(tx, restaurantId, locationId);

    const sale = await tx.retailSale.create({
      data: {
        restaurantId,
        locationId,
        deviceId: device?.id || null,
        shiftId,
        clientSaleId: body.clientSaleId,
        folio,
        subtotal: Number(totals.subtotal.toFixed(2)),
        discount: saleDiscount,
        tax,
        total,
        customerName: body.customerName || null,
        customerPhone: body.customerPhone || null,
        notes: body.notes || null,
        createdById: req.user?.id || null,
        syncedAt: new Date(),
      },
    });

    for (const line of body.lines) {
      const sku = skuMap.get(line.skuId);
      const quantity = assertPositiveQty(line.quantity, 'quantity');
      // Mismo priceFor que el subtotal de arriba: si divergieran, el total de la
      // venta no cuadraría contra la suma de sus líneas.
      const unitPrice = priceFor(sku, quantity);
      const lineDiscount = Math.min(Math.max(toNumber(line.discount), 0), quantity * unitPrice);
      const subtotal = Number((quantity * unitPrice - lineDiscount).toFixed(2));
      const costSnapshot = Number((quantity * Number(sku.cost || 0)).toFixed(4));
      // El label de variante ya no asume ropa: incluye style y respeta que las
      // columnas son genéricas (el giro las reetiqueta en la UI).
      const variantLabel = [sku.size, sku.color, sku.material, sku.style].filter(Boolean).join(' / ') || null;

      const current = await tx.retailStockByLocation.upsert({
        where: { locationId_skuId: { locationId, skuId: sku.id } },
        create: { restaurantId, locationId, skuId: sku.id, qty: 0, minQty: 0 },
        update: {},
        select: { id: true },
      });

      // Decremento atómico y guardado contra la carrera (dos cobros del mismo SKU
      // a la vez): la condición qty>=cantidad va en el WHERE, no en un read previo,
      // así Postgres serializa y nunca sobre-vende. allowNegativeStock lo omite.
      if (allowNeg) {
        await tx.retailStockByLocation.update({ where: { id: current.id }, data: { qty: { decrement: quantity } } });
      } else {
        const dec = await tx.retailStockByLocation.updateMany({
          where: { id: current.id, qty: { gte: quantity } },
          data: { qty: { decrement: quantity } },
        });
        if (dec.count === 0) {
          const err = new Error(`Stock insuficiente para ${sku.sku}`);
          err.status = 409;
          throw err;
        }
      }
      const updated = await tx.retailStockByLocation.findUnique({ where: { id: current.id }, select: { qty: true } });

      await tx.retailSaleLine.create({
        data: {
          saleId: sale.id,
          skuId: sku.id,
          skuCode: sku.sku,
          productName: sku.product.name,
          variantLabel,
          quantity,
          unitPrice,
          discount: lineDiscount,
          subtotal,
          costSnapshot,
        },
      });

      await tx.retailStockMovement.create({
        data: {
          restaurantId,
          locationId,
          skuId: sku.id,
          delta: -quantity,
          reason: 'SALE',
          refType: 'retailSale',
          refId: sale.id,
          balanceAfter: Number(updated.qty),
          unitCostAtMove: Number(sku.cost || 0),
          createdById: req.user?.id || null,
          notes: `Venta retail ${sale.folio}`,
        },
      });
    }

    await tx.retailPayment.createMany({
      data: body.payments.map((payment) => ({
        saleId: sale.id,
        method: payment.method,
        amount: payment.amount,
        reference: payment.reference || null,
      })),
    });

    const fullSale = await tx.retailSale.findUnique({
      where: { id: sale.id },
      include: { lines: true, payments: true },
    });
    return { sale: fullSale, idempotent: false };
    });
  } catch (e) {
    // Carrera concurrente (multi-tap / reintento del outbox): el UNIQUE
    // (restaurantId, clientSaleId) gana y el segundo intento revienta con P2002.
    // No hubo doble descuento de stock (rollback de la tx) → devolvemos la venta
    // ya registrada como idempotente en vez de un 500.
    if (e.code === 'P2002') {
      const dup = await prisma.retailSale.findFirst({
        where: { restaurantId, clientSaleId: body.clientSaleId },
        include: { lines: true, payments: true },
      });
      if (dup) return { sale: dup, idempotent: true };
    }
    throw e;
  }
}

async function reverseRetailSale(saleId, req, action) {
  const restaurantId = restaurantIdFrom(req);
  if (!restaurantId) {
    const err = new Error('Restaurante no identificado');
    err.status = 400;
    throw err;
  }

  const nextStatus = action === 'cancel' ? 'CANCELLED' : 'RETURNED';
  const refType = action === 'cancel' ? 'retailSaleCancel' : 'retailSaleReturn';
  const movementReason = action === 'cancel' ? 'CANCEL' : 'RETURN';
  const actionLabel = action === 'cancel' ? 'Cancelacion' : 'Devolucion';
  const notes = String(req.body?.notes || '').trim();

  const sale = await prisma.retailSale.findFirst({
    where: { id: saleId, restaurantId },
    include: { lines: { include: { sku: true } }, payments: true },
  });
  if (!sale) {
    const err = new Error('Venta retail no encontrada');
    err.status = 404;
    throw err;
  }
  if (sale.status !== 'COMPLETED') {
    const err = new Error(`La venta ${sale.folio} ya fue revertida o no esta completada`);
    err.status = 409;
    throw err;
  }

  return prisma.$transaction(async (tx) => {
    // Transición atómica COMPLETED → nextStatus ANTES de reponer/reembolsar: solo
    // el primer reverso gana. Un segundo (doble clic / reintento concurrente) ve
    // count 0 → 409, evitando doble reposición de stock y doble asiento negativo.
    const flip = await tx.retailSale.updateMany({
      where: { id: sale.id, status: 'COMPLETED' },
      data: {
        status: nextStatus,
        notes: [sale.notes, notes ? `${actionLabel}: ${notes}` : actionLabel].filter(Boolean).join('\n'),
      },
    });
    if (flip.count === 0) {
      const err = new Error(`La venta ${sale.folio} ya fue revertida`);
      err.status = 409;
      throw err;
    }

    for (const line of sale.lines) {
      const balance = await tx.retailStockByLocation.upsert({
        where: { locationId_skuId: { locationId: sale.locationId, skuId: line.skuId } },
        create: { restaurantId, locationId: sale.locationId, skuId: line.skuId, qty: 0, minQty: 0 },
        update: {},
        select: { id: true },
      });
      const updated = await tx.retailStockByLocation.update({
        where: { id: balance.id },
        data: { qty: { increment: Number(line.quantity) } },
        select: { qty: true },
      });

      await tx.retailStockMovement.create({
        data: {
          restaurantId,
          locationId: sale.locationId,
          skuId: line.skuId,
          delta: Number(line.quantity),
          reason: movementReason,
          refType,
          refId: sale.id,
          balanceAfter: Number(updated.qty),
          unitCostAtMove: Number(line.sku?.cost || line.costSnapshot || 0),
          createdById: req.user?.id || null,
          notes: `${actionLabel} retail ${sale.folio}${notes ? `: ${notes}` : ''}`,
        },
      });
    }

    // Asiento de reembolso: contrapartida negativa de cada pago original para
    // que el ledger de RetailPayment de la venta neteé a 0 tras un reverso total.
    // Deja rastro financiero real del dinero devuelto (no solo stock + estado).
    if (sale.payments.length) {
      await tx.retailPayment.createMany({
        data: sale.payments
          .filter((p) => Number(p.amount) > 0)
          .map((p) => ({
            saleId: sale.id,
            method: p.method,
            amount: -Number(p.amount),
            reference: `${actionLabel} ${sale.folio}`,
          })),
      });
    }

    const updatedSale = await tx.retailSale.findUnique({
      where: { id: sale.id },
      include: { lines: true, payments: true, location: { select: { id: true, name: true } } },
    });

    return { sale: updatedSale };
  });
}

router.get('/catalog', async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    const locationId = locationIdFrom(req, req.query.locationId);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    // El giro viaja con el catálogo (retail multigiro · Fase 1): es la primera
    // llamada del POS y ya va en cada arranque, así que la app lo obtiene sin
    // un round-trip extra. Ver apps/moda/src/lib/giro.ts.
    const [products, config] = await Promise.all([
      prisma.retailProduct.findMany({
        where: { restaurantId, isActive: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        include: {
          skus: {
            where: { isActive: true },
            orderBy: [{ sku: 'asc' }],
            include: locationId
              ? { stockBalances: { where: { locationId }, select: { qty: true, minQty: true } } }
              : undefined,
          },
        },
      }),
      prisma.restaurantConfig.findUnique({
        where: { restaurantId },
        select: { retailGiro: true },
      }),
    ]);

    // Un tenant sin fila de config todavía opera como ropa (default del schema).
    res.json({
      products,
      giro: config?.retailGiro || 'ROPA',
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/catalog/products', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const data = productSchema.parse(req.body);
    const product = await prisma.retailProduct.create({
      data: {
        restaurantId,
        name: data.name.trim(),
        description: data.description || null,
        brand: data.brand || null,
        category: data.category || null,
        gender: data.gender || null,
        season: data.season || null,
        imageUrl: data.imageUrl || null,
      },
    });
    res.status(201).json(product);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Payload de producto invalido', details: e.errors });
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/catalog/skus', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const data = skuSchema.parse(req.body);
    const product = await prisma.retailProduct.findFirst({
      where: { id: data.productId, restaurantId },
      select: { id: true },
    });
    if (!product) return res.status(404).json({ error: 'Producto retail no encontrado' });

    const sku = await prisma.retailSku.create({
      data: {
        restaurantId,
        productId: product.id,
        sku: data.sku.trim(),
        barcode: data.barcode || null,
        size: data.size || null,
        color: data.color || null,
        material: data.material || null,
        style: data.style || null,
        price: data.price,
        cost: toNumber(data.cost),
        imageUrl: data.imageUrl || null,
        unitOfMeasure: data.unitOfMeasure || 'PZA',
        unitsPerPackage: data.unitsPerPackage ?? null,
        binLocation: data.binLocation || null,
        supplierRef: data.supplierRef || null,
      },
    });
    res.status(201).json(sku);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Payload de SKU invalido', details: e.errors });
    if (e.code === 'P2002') return res.status(409).json({ error: 'SKU o codigo de barras ya existe' });
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Editar un SKU existente (precio, costo, código, variante, activo). Soft-delete
// vía isActive=false. Mapeo explícito (anti mass-assignment); solo toca campos enviados.
router.put('/catalog/skus/:id', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const data = skuUpdateSchema.parse(req.body);
    const existing = await prisma.retailSku.findFirst({ where: { id: req.params.id, restaurantId }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: 'SKU retail no encontrado' });

    const patch = {};
    if (data.sku !== undefined) patch.sku = data.sku.trim();
    for (const f of ['barcode', 'size', 'color', 'material', 'style', 'binLocation', 'supplierRef']) {
      if (data[f] !== undefined) patch[f] = data[f] || null;
    }
    if (data.price !== undefined) patch.price = data.price;
    if (data.cost !== undefined) patch.cost = data.cost;
    if (data.isActive !== undefined) patch.isActive = data.isActive;
    // unitOfMeasure es NOT NULL: un '' del cliente no debe volverlo null.
    if (data.unitOfMeasure !== undefined) patch.unitOfMeasure = data.unitOfMeasure;
    // unitsPerPackage sí es nullable (null = "no aplica"); ?? preserva el null
    // explícito, que || convertiría en null igual pero también mataría un 0.
    if (data.unitsPerPackage !== undefined) patch.unitsPerPackage = data.unitsPerPackage ?? null;

    const sku = await prisma.retailSku.update({ where: { id: existing.id }, data: patch });
    res.json(sku);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Payload de SKU invalido', details: e.errors });
    if (e.code === 'P2002') return res.status(409).json({ error: 'SKU o codigo de barras ya existe' });
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// RETAIL MULTIGIRO · mayoreo, compatibilidad y equivalencias
// Ver docs/plan-retail-multigiro.md (Fases 3 y 4).
// ═══════════════════════════════════════════════════════════════════════════

// Verifica que el SKU/producto sea del tenant ANTES de colgarle nada. El guard
// filtra por restaurantId, pero un id ajeno daría 500 por FK en vez de un 404
// claro — y confirmar la pertenencia es lo que impide escribir en otro tenant.
async function assertOwnedSku(restaurantId, skuId) {
  const sku = await prisma.retailSku.findFirst({ where: { id: skuId, restaurantId }, select: { id: true } });
  if (!sku) { const e = new Error('SKU retail no encontrado'); e.status = 404; throw e; }
  return sku;
}
async function assertOwnedProduct(restaurantId, productId) {
  const p = await prisma.retailProduct.findFirst({ where: { id: productId, restaurantId }, select: { id: true } });
  if (!p) { const e = new Error('Producto retail no encontrado'); e.status = 404; throw e; }
  return p;
}

// ── Fase 5 · Giro del tenant ────────────────────────────────────────────────
// Giros válidos. Debe coincidir con el tipo Giro de apps/moda/src/lib/giro.ts.
// La columna es texto libre (agregar un giro no cuesta migración), pero la
// ESCRITURA sí se valida: un valor arbitrario dejaría a la app cayendo al
// default ROPA sin explicar por qué.
const GIROS = ['ROPA', 'FERRETERIA', 'REFACCIONARIA'];

router.put('/config/giro', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const { giro } = req.body || {};
    if (!GIROS.includes(giro)) {
      return res.status(400).json({ error: `giro invalido. Valores permitidos: ${GIROS.join(', ')}` });
    }
    // upsert: un tenant recién creado puede no tener fila de config todavía.
    const config = await prisma.restaurantConfig.upsert({
      where: { restaurantId },
      update: { retailGiro: giro },
      create: { restaurantId, retailGiro: giro },
      select: { retailGiro: true },
    });
    res.json({ giro: config.retailGiro });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ── Fase 3 · Precios por volumen (mayoreo) ──────────────────────────────────
const tierSchema = z.object({
  skuId: z.string().min(1),
  minQty: z.number().positive(),
  price: z.number().nonnegative(),
});

router.get('/catalog/skus/:id/price-tiers', async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    await assertOwnedSku(restaurantId, req.params.id);
    const tiers = await prisma.retailPriceTier.findMany({
      where: { restaurantId, skuId: req.params.id },
      orderBy: { minQty: 'asc' },
    });
    res.json(tiers);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.post('/catalog/price-tiers', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const data = tierSchema.parse(req.body);
    await assertOwnedSku(restaurantId, data.skuId);
    const tier = await prisma.retailPriceTier.create({
      data: { restaurantId, skuId: data.skuId, minQty: data.minQty, price: data.price },
    });
    res.status(201).json(tier);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Payload de tier invalido', details: e.errors });
    if (e.code === 'P2002') return res.status(409).json({ error: 'Ya existe un precio para esa cantidad minima' });
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.delete('/catalog/price-tiers/:id', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const { count } = await prisma.retailPriceTier.deleteMany({ where: { id: req.params.id, restaurantId } });
    if (!count) return res.status(404).json({ error: 'Tier no encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ── Fase 4 · Compatibilidad (fitment) ───────────────────────────────────────
const fitmentSchema = z.object({
  productId: z.string().min(1),
  make: z.string().min(1),
  model: z.string().optional(),
  yearFrom: z.number().int().optional(),
  yearTo: z.number().int().optional(),
  engine: z.string().optional(),
}).refine((d) => d.yearFrom == null || d.yearTo == null || d.yearFrom <= d.yearTo, {
  message: 'yearFrom no puede ser mayor que yearTo',
});

router.post('/catalog/fitments', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const data = fitmentSchema.parse(req.body);
    await assertOwnedProduct(restaurantId, data.productId);
    const fitment = await prisma.retailFitment.create({
      data: {
        restaurantId,
        productId: data.productId,
        make: data.make.trim(),
        model: data.model?.trim() || null,
        yearFrom: data.yearFrom ?? null,
        yearTo: data.yearTo ?? null,
        engine: data.engine?.trim() || null,
      },
    });
    res.status(201).json(fitment);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Payload de compatibilidad invalido', details: e.errors });
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.delete('/catalog/fitments/:id', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const { count } = await prisma.retailFitment.deleteMany({ where: { id: req.params.id, restaurantId } });
    if (!count) return res.status(404).json({ error: 'Compatibilidad no encontrada' });
    res.json({ ok: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ── Fase 4 · Equivalencias (cross-reference) ────────────────────────────────
const crossRefSchema = z.object({
  skuId: z.string().min(1),
  brand: z.string().optional(),
  partNumber: z.string().min(1),
});

router.post('/catalog/cross-refs', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const data = crossRefSchema.parse(req.body);
    await assertOwnedSku(restaurantId, data.skuId);
    const ref = await prisma.retailCrossRef.create({
      data: {
        restaurantId,
        skuId: data.skuId,
        brand: data.brand?.trim() || null,
        partNumber: data.partNumber.trim(),
      },
    });
    res.status(201).json(ref);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Payload de equivalencia invalido', details: e.errors });
    if (e.code === 'P2002') return res.status(409).json({ error: 'Esa equivalencia ya existe para el SKU' });
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.delete('/catalog/cross-refs/:id', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const { count } = await prisma.retailCrossRef.deleteMany({ where: { id: req.params.id, restaurantId } });
    if (!count) return res.status(404).json({ error: 'Equivalencia no encontrada' });
    res.json({ ok: true });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// ── Fase 4 · Búsqueda por equivalencia o compatibilidad ─────────────────────
// El mostrador de una refaccionaria busca por número de parte de OTRA marca o
// por el coche del cliente. Es server-side (a diferencia del escaneo del POS,
// que filtra el catálogo ya cargado en memoria) porque estas tablas no viajan
// en GET /catalog: crecen mucho más que el catálogo.
router.get('/catalog/search', async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const { partNumber, make, model, year } = req.query;

    if (partNumber) {
      const refs = await prisma.retailCrossRef.findMany({
        where: { restaurantId, partNumber: { equals: String(partNumber), mode: 'insensitive' } },
        include: { sku: { include: { product: true } } },
        take: 50,
      });
      return res.json({ skus: refs.map((r) => r.sku) });
    }

    if (make) {
      const yearNum = year ? Number(year) : null;
      const fitments = await prisma.retailFitment.findMany({
        where: {
          restaurantId,
          make: { equals: String(make), mode: 'insensitive' },
          ...(model ? { model: { equals: String(model), mode: 'insensitive' } } : {}),
          // Rango abierto por ambos lados: null = "aplica siempre por ese lado".
          ...(Number.isFinite(yearNum) && yearNum
            ? {
              AND: [
                { OR: [{ yearFrom: null }, { yearFrom: { lte: yearNum } }] },
                { OR: [{ yearTo: null }, { yearTo: { gte: yearNum } }] },
              ],
            }
            : {}),
        },
        include: { product: { include: { skus: { where: { isActive: true } } } } },
        take: 50,
      });
      return res.json({ skus: fitments.flatMap((f) => f.product.skus) });
    }

    return res.status(400).json({ error: 'Indica partNumber o make' });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.get('/stock', async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    const locationId = locationIdFrom(req, req.query.locationId);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const where = { restaurantId };
    if (locationId) where.locationId = locationId;
    const rows = await prisma.retailStockByLocation.findMany({
      where,
      include: {
        location: { select: { id: true, name: true, isCentralWarehouse: true } },
        sku: { include: { product: true } },
      },
      orderBy: [{ locationId: 'asc' }, { skuId: 'asc' }],
    });
    res.json(rows);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/sales', async (req, res) => {
  try {
    const result = await createRetailSale(req.body, req);
    res.status(result.idempotent ? 200 : 201).json(result);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Payload de venta invalido', details: e.errors });
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get('/sales', async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    const locationId = locationIdFrom(req, req.query.locationId);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const where = { restaurantId };
    if (locationId) where.locationId = locationId;
    const sales = await prisma.retailSale.findMany({
      where,
      include: { lines: true, payments: true, location: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(req.query.limit) || 80, 200),
    });
    res.json(sales);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/sales/:saleId/cancel', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const result = await reverseRetailSale(req.params.saleId, req, 'cancel');
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/sales/:saleId/return', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const result = await reverseRetailSale(req.params.saleId, req, 'return');
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/transfers', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const fromLocationId = locationIdFrom(req, req.body.fromLocationId);
    if (!fromLocationId) return res.status(400).json({ error: 'Sucursal origen requerida' });
    await assertLocation(restaurantId, fromLocationId);

    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'items requerido' });

    const skuIds = [...new Set(items.map((it) => it.skuId))];
    const toLocationIds = [...new Set(items.map((it) => it.toLocationId))];
    const [skus, destLocations] = await Promise.all([
      prisma.retailSku.findMany({ where: { restaurantId, id: { in: skuIds }, isActive: true } }),
      prisma.location.findMany({ where: { restaurantId, id: { in: toLocationIds }, isActive: true }, select: { id: true } }),
    ]);
    if (skus.length !== skuIds.length) return res.status(400).json({ error: 'Uno o mas SKUs no pertenecen al restaurante' });
    if (destLocations.length !== toLocationIds.length) return res.status(400).json({ error: 'Una o mas sucursales destino son invalidas' });
    const skuMap = new Map(skus.map((sku) => [sku.id, sku]));

    const needed = new Map();
    for (const item of items) {
      if (item.toLocationId === fromLocationId) return res.status(400).json({ error: 'Origen y destino no pueden ser iguales' });
      const qty = assertPositiveQty(item.qty);
      needed.set(item.skuId, (needed.get(item.skuId) || 0) + qty);
    }

    for (const [skuId, qty] of needed) {
      const balance = await prisma.retailStockByLocation.findUnique({
        where: { locationId_skuId: { locationId: fromLocationId, skuId } },
        select: { qty: true },
      });
      if (!balance || Number(balance.qty) < qty) {
        return res.status(409).json({ error: `Stock insuficiente para SKU ${skuMap.get(skuId)?.sku || skuId}` });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const transfer = await tx.retailTransfer.create({
        data: {
          restaurantId,
          fromLocationId,
          notes: req.body.notes || null,
          totalCost: items.reduce((sum, item) => sum + assertPositiveQty(item.qty) * Number(skuMap.get(item.skuId)?.cost || 0), 0),
          createdById: req.user?.id || null,
          completedAt: new Date(),
        },
      });

      for (const item of items) {
        const sku = skuMap.get(item.skuId);
        const qty = assertPositiveQty(item.qty);
        const dec = await tx.retailStockByLocation.updateMany({
          where: { locationId: fromLocationId, skuId: sku.id, qty: { gte: qty } },
          data: { qty: { decrement: qty } },
        });
        if (dec.count === 0) {
          const err = new Error(`Stock insuficiente para ${sku.sku}`);
          err.status = 409;
          throw err;
        }
        const out = await tx.retailStockByLocation.findUnique({
          where: { locationId_skuId: { locationId: fromLocationId, skuId: sku.id } },
          select: { qty: true },
        });
        await tx.retailStockMovement.create({
          data: {
            restaurantId,
            locationId: fromLocationId,
            skuId: sku.id,
            delta: -qty,
            reason: 'TRANSFER_OUT',
            refType: 'retailTransfer',
            refId: transfer.id,
            balanceAfter: Number(out.qty),
            unitCostAtMove: Number(sku.cost || 0),
            createdById: req.user?.id || null,
            notes: `Traspaso retail a ${item.toLocationId}`,
          },
        });

        const dest = await tx.retailStockByLocation.upsert({
          where: { locationId_skuId: { locationId: item.toLocationId, skuId: sku.id } },
          create: { restaurantId, locationId: item.toLocationId, skuId: sku.id, qty: 0, minQty: 0 },
          update: {},
          select: { id: true },
        });
        const incoming = await tx.retailStockByLocation.update({
          where: { id: dest.id },
          data: { qty: { increment: qty } },
          select: { qty: true },
        });
        await tx.retailStockMovement.create({
          data: {
            restaurantId,
            locationId: item.toLocationId,
            skuId: sku.id,
            delta: qty,
            reason: 'TRANSFER_IN',
            refType: 'retailTransfer',
            refId: transfer.id,
            balanceAfter: Number(incoming.qty),
            unitCostAtMove: Number(sku.cost || 0),
            createdById: req.user?.id || null,
            notes: 'Traspaso retail recibido',
          },
        });
        await tx.retailTransferItem.create({
          data: {
            transferId: transfer.id,
            skuId: sku.id,
            toLocationId: item.toLocationId,
            qty,
            unitCostAtMove: Number(sku.cost || 0),
          },
        });
      }

      return tx.retailTransfer.findUnique({
        where: { id: transfer.id },
        include: { items: true },
      });
    });

    res.status(201).json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/counts', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    const locationId = locationIdFrom(req, req.body.locationId);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    if (!locationId) return res.status(400).json({ error: 'Sucursal requerida' });
    await assertLocation(restaurantId, locationId);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'items requerido' });

    const result = await prisma.$transaction(async (tx) => {
      const movements = [];
      for (const item of items) {
        const countedQty = Math.max(toNumber(item.countedQty), 0);
        const balance = await tx.retailStockByLocation.upsert({
          where: { locationId_skuId: { locationId, skuId: item.skuId } },
          create: { restaurantId, locationId, skuId: item.skuId, qty: 0, minQty: 0 },
          update: {},
          select: { id: true, qty: true },
        });
        const delta = countedQty - Number(balance.qty);
        const updated = await tx.retailStockByLocation.update({
          where: { id: balance.id },
          data: { qty: countedQty },
          select: { qty: true },
        });
        const movement = await tx.retailStockMovement.create({
          data: {
            restaurantId,
            locationId,
            skuId: item.skuId,
            delta,
            reason: 'PHYSICAL_COUNT',
            refType: 'retailPhysicalCount',
            refId: req.body.clientCountId || null,
            balanceAfter: Number(updated.qty),
            createdById: req.user?.id || null,
            notes: req.body.notes || null,
          },
        });
        movements.push(movement);
      }
      return movements;
    });

    res.status(201).json({ movements: result });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/devices/register', async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    const locationId = locationIdFrom(req, req.body.locationId);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    if (!locationId) return res.status(400).json({ error: 'Sucursal requerida' });
    await assertLocation(restaurantId, locationId);
    if (!req.body.deviceKey) return res.status(400).json({ error: 'deviceKey requerido' });

    const device = await prisma.retailDevice.upsert({
      where: { restaurantId_deviceKey: { restaurantId, deviceKey: String(req.body.deviceKey) } },
      create: {
        restaurantId,
        locationId,
        deviceKey: String(req.body.deviceKey),
        name: String(req.body.name || 'Caja Windows'),
        platform: String(req.body.platform || 'WINDOWS'),
        lastSyncAt: new Date(),
      },
      update: {
        restaurantId,
        locationId,
        name: req.body.name ? String(req.body.name) : undefined,
        platform: req.body.platform ? String(req.body.platform) : undefined,
        isActive: true,
        lastSyncAt: new Date(),
      },
    });
    res.status(201).json(device);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get('/sync/bootstrap', async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    const locationId = locationIdFrom(req, req.query.locationId);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    if (!locationId) return res.status(400).json({ error: 'Sucursal requerida' });
    await assertLocation(restaurantId, locationId);

    const [products, stock, employees] = await Promise.all([
      prisma.retailProduct.findMany({
        where: { restaurantId, isActive: true },
        include: { skus: { where: { isActive: true } } },
      }),
      prisma.retailStockByLocation.findMany({ where: { restaurantId, locationId } }),
      prisma.employee.findMany({
        where: { locationId, isActive: true },
        // offlinePin (SHA256) basta para validar el PIN offline en la caja.
        // NUNCA exponer el hash bcrypt `pin` a los dispositivos (mismo criterio
        // que employees.routes.js, que lo strippea antes de responder).
        select: { id: true, name: true, role: true, offlinePin: true },
      }),
    ]);

    res.json({ products, stock, employees, serverTime: new Date().toISOString() });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/sync/outbox', async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const events = Array.isArray(req.body.events) ? req.body.events : [];
    if (!events.length) return res.status(400).json({ error: 'events requerido' });

    const results = [];
    for (const event of events) {
      if (!event.clientEventId || !event.eventType) {
        results.push({ ok: false, error: 'Evento incompleto' });
        continue;
      }
      const existing = await prisma.retailSyncOutbox.findFirst({
        where: { restaurantId, clientEventId: String(event.clientEventId) },
      });
      if (existing?.status === 'APPLIED') {
        results.push({ ok: true, clientEventId: event.clientEventId, idempotent: true });
        continue;
      }

      await prisma.retailSyncOutbox.upsert({
        where: { restaurantId_clientEventId: { restaurantId, clientEventId: String(event.clientEventId) } },
        create: {
          restaurantId,
          clientEventId: String(event.clientEventId),
          eventType: String(event.eventType),
          payload: event.payload || {},
        },
        update: { attempts: { increment: 1 }, lastError: null },
      });

      try {
        let applied = null;
        if (event.eventType === 'retail.sale.completed') {
          applied = await createRetailSale(event.payload, req);
        } else {
          throw new Error(`eventType no soportado: ${event.eventType}`);
        }
        await prisma.retailSyncOutbox.update({
          where: { restaurantId_clientEventId: { restaurantId, clientEventId: String(event.clientEventId) } },
          data: { status: 'APPLIED', appliedAt: new Date(), lastError: null },
        });
        results.push({ ok: true, clientEventId: event.clientEventId, applied });
      } catch (applyErr) {
        await prisma.retailSyncOutbox.update({
          where: { restaurantId_clientEventId: { restaurantId, clientEventId: String(event.clientEventId) } },
          data: { status: 'FAILED', lastError: applyErr.message },
        });
        results.push({ ok: false, clientEventId: event.clientEventId, error: applyErr.message });
      }
    }

    res.json({ results });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ── Caja / turno retail ──────────────────────────────────────────────────────

const cashMovementSchema = z.object({
  type: z.enum(['CASH_IN', 'CASH_OUT', 'EXPENSE']),
  amount: z.number().positive(),
  reason: z.string().optional(),
  category: z.string().optional(),
});

// Abre una caja para la sucursal. Una sola ABIERTA por sucursal a la vez.
router.post('/shifts/open', async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    const locationId = locationIdFrom(req, req.body.locationId);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    if (!locationId) return res.status(400).json({ error: 'Sucursal requerida' });
    await assertLocation(restaurantId, locationId);

    const existing = await prisma.retailCashShift.findFirst({
      where: { restaurantId, locationId, status: 'OPEN' },
      select: { id: true },
    });
    if (existing) return res.status(409).json({ error: 'Ya hay una caja abierta en esta sucursal', shiftId: existing.id });

    let deviceId = null;
    if (req.body.deviceId) {
      const device = await prisma.retailDevice.findFirst({ where: { id: req.body.deviceId, restaurantId }, select: { id: true } });
      deviceId = device?.id || null;
    } else if (req.body.device?.deviceKey) {
      const device = await getOrCreateDevice(prisma, restaurantId, locationId, req.body.device);
      deviceId = device?.id || null;
    }

    const shift = await prisma.retailCashShift.create({
      data: {
        restaurantId,
        locationId,
        deviceId,
        openedById: req.user?.id || null,
        openedByName: req.user?.name || null,
        openingFloat: Math.max(toNumber(req.body.openingFloat), 0),
        blindClose: Boolean(req.body.blindClose),
      },
    });
    res.status(201).json(shift);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Caja abierta de la sucursal (para reanudar al entrar a la app).
router.get('/shifts/active', async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    const locationId = locationIdFrom(req, req.query.locationId);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    if (!locationId) return res.status(400).json({ error: 'Sucursal requerida' });
    const shift = await prisma.retailCashShift.findFirst({
      where: { restaurantId, locationId, status: 'OPEN' },
      include: { movements: { orderBy: { createdAt: 'asc' } } },
    });
    res.json({ shift: shift || null });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Entrada / salida / gasto de efectivo durante el turno.
router.post('/shifts/:id/cash-movement', async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const data = cashMovementSchema.parse(req.body);
    const shift = await prisma.retailCashShift.findFirst({
      where: { id: req.params.id, restaurantId },
      select: { id: true, status: true },
    });
    if (!shift) return res.status(404).json({ error: 'Caja no encontrada' });
    if (shift.status !== 'OPEN') return res.status(409).json({ error: 'La caja ya esta cerrada' });
    const movement = await prisma.retailCashMovement.create({
      data: {
        shiftId: shift.id,
        type: data.type,
        amount: data.amount,
        reason: data.reason || null,
        category: data.category || null,
        createdById: req.user?.id || null,
      },
    });
    res.status(201).json(movement);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Movimiento invalido', details: e.errors });
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Cierra la caja: calcula esperado (float + ventas efectivo + entradas - salidas)
// vs contado y congela snapshots. Solo en la transición real OPEN → CLOSED.
router.post('/shifts/:id/close', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const countedCash = Math.max(toNumber(req.body.countedCash), 0);
    const closeNotes = String(req.body.notes || '').trim();

    const result = await prisma.$transaction(async (tx) => {
      const shift = await tx.retailCashShift.findFirst({ where: { id: req.params.id, restaurantId } });
      if (!shift) { const e = new Error('Caja no encontrada'); e.status = 404; throw e; }
      if (shift.status !== 'OPEN') { const e = new Error('La caja ya esta cerrada'); e.status = 409; throw e; }

      // Mismo cálculo que el corte en vivo (fuente única). Las ventas canceladas/
      // devueltas quedan fuera (su par +/- neteaba a 0 en la gaveta de todos modos).
      const t = await computeShiftTotals(tx, shift.id, shift.openingFloat);
      const difference = Number((countedCash - t.expectedCash).toFixed(2));

      // UPDATE guardado contra doble cierre concurrente: solo cierra si SIGUE OPEN.
      // El check de arriba es read-then-act; este updateMany condicional serializa.
      const guard = await tx.retailCashShift.updateMany({
        where: { id: shift.id, status: 'OPEN' },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedById: req.user?.id || null,
          countedCash,
          expectedCash: t.expectedCash,
          difference,
          totalCashSales: t.totalCashSales,
          totalCardSales: t.totalCardSales,
          totalTransferSales: t.totalTransferSales,
          totalCashIn: t.totalCashIn,
          totalCashOut: t.totalCashOut,
          salesCount: t.salesCount,
          notes: [shift.notes, closeNotes].filter(Boolean).join('\n') || null,
        },
      });
      if (guard.count === 0) { const e = new Error('La caja ya esta cerrada'); e.status = 409; throw e; }
      return tx.retailCashShift.findUnique({ where: { id: shift.id }, include: { movements: true } });
    });

    // Correo del corte de TIENDA al dueño (best-effort, no se await-ea). Mismo
    // mecanismo/config que el restaurante (cashCutEmailEnabled + cashCutEmails),
    // mapeando los campos del corte retail. El cierre ya está confirmado: un
    // fallo de correo nunca debe bloquear la respuesta ni revertir el cierre.
    sendCashCutEmail({
      restaurantId: result.restaurantId,
      locationId: result.locationId,
      closedByName: req.user?.name || result.openedByName || 'Cajero',
      closedAt: result.closedAt,
      moduleLabel: 'Tienda',
      adminUrl: null, // los cortes de retail se ven en la app de tienda, no en /admin
      cut: {
        ordersCount: result.salesCount,
        totalCash: result.totalCashSales,
        totalCard: result.totalCardSales,
        totalTransfer: result.totalTransferSales,
        totalCourtesy: 0,
        totalSales:
          Number(result.totalCashSales) + Number(result.totalCardSales) + Number(result.totalTransferSales),
        openingFloat: result.openingFloat,
        totalCashIn: result.totalCashIn,
        totalExpenses: result.totalCashOut,
        expectedCash: result.expectedCash,
        closingFloat: result.countedCash,
        variance: result.difference == null ? null : Number(result.difference),
        notes: result.notes,
      },
    }).catch((e) => console.error('[cash-cut-email][retail]', e?.message || e));

    // Corte ciego: el cajero no ve esperado/diferencia al cerrar; el supervisor
    // los consulta con GET /shifts/:id.
    if (result.blindClose) {
      const { expectedCash, difference, totalCashSales, totalCardSales, totalTransferSales, ...rest } = result;
      return res.json({ shift: { ...rest, blindHidden: true } });
    }
    res.json({ shift: result });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Lista de cajas (reporte).
router.get('/shifts', async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    const locationId = locationIdFrom(req, req.query.locationId);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const where = { restaurantId };
    if (locationId) where.locationId = locationId;
    if (req.query.status) where.status = String(req.query.status);
    const shifts = await prisma.retailCashShift.findMany({
      where,
      orderBy: { openedAt: 'desc' },
      take: Math.min(Number(req.query.limit) || 50, 200),
    });
    res.json(shifts);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Detalle de una caja (incluye esperado/diferencia aunque sea corte ciego).
router.get('/shifts/:id', async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const shift = await prisma.retailCashShift.findFirst({
      where: { id: req.params.id, restaurantId },
      include: {
        movements: { orderBy: { createdAt: 'asc' } },
        location: { select: { id: true, name: true } },
      },
    });
    if (!shift) return res.status(404).json({ error: 'Caja no encontrada' });
    // Corte ciego: el cajero NO ve esperado/diferencia/ventas; solo un admin. Cierra
    // la fuga por la que un CASHIER leía aquí lo que el cierre ciego le ocultaba.
    const isAdmin = ADMIN_ROLES.includes(req.user?.role);
    if (shift.blindClose && !isAdmin) {
      const { expectedCash, difference, totalCashSales, totalCardSales, totalTransferSales, ...rest } = shift;
      return res.json({ ...rest, blindHidden: true });
    }
    res.json(shift);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Corte EN VIVO de la caja (totales calculados, no snapshot): para mostrar el
// turno en curso y el esperado antes de cerrar. Respeta el corte ciego.
router.get('/shifts/:id/summary', async (req, res) => {
  try {
    const restaurantId = restaurantIdFrom(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const shift = await prisma.retailCashShift.findFirst({
      where: { id: req.params.id, restaurantId },
      include: { movements: { orderBy: { createdAt: 'asc' } }, location: { select: { id: true, name: true } } },
    });
    if (!shift) return res.status(404).json({ error: 'Caja no encontrada' });
    const totals = await computeShiftTotals(prisma, shift.id, shift.openingFloat);
    const isAdmin = ADMIN_ROLES.includes(req.user?.role);
    if (shift.blindClose && !isAdmin) {
      const { expectedCash, totalCashSales, totalCardSales, totalTransferSales, ...safe } = totals;
      return res.json({ shift, totals: { ...safe, blindHidden: true } });
    }
    res.json({ shift, totals });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

module.exports = router;
