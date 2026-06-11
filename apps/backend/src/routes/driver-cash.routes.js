const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess, requireRole } = require('../middleware/auth.middleware');
const { localDayRange } = require('../utils/dayRange');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de imagen no permitido'));
  },
});

function isStaff(user) {
  return ['ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'].includes(user?.role);
}

async function assertDriverAccess(req, res) {
  const driverId = req.params.driverId;
  if (!driverId) {
    res.status(400).json({ error: 'driverId requerido' });
    return null;
  }
  if (req.user?.id !== driverId && !isStaff(req.user)) {
    res.status(403).json({ error: 'No autorizado para este repartidor' });
    return null;
  }
  const restaurantId = req.restaurantId || req.user?.restaurantId;
  const driver = await prisma.employee.findFirst({
    where: {
      id: driverId,
      role: 'DELIVERY',
      isActive: true,
      ...(req.user?.role !== 'SUPER_ADMIN' && restaurantId ? { location: { restaurantId } } : {}),
    },
    select: { id: true, name: true, locationId: true },
  });
  if (!driver) {
    res.status(404).json({ error: 'Repartidor no encontrado' });
    return null;
  }
  return driver;
}

async function uploadPhoto(buffer, folder) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({ folder }, (err, result) => {
      if (err) reject(err);
      else resolve(result.secure_url);
    }).end(buffer);
  });
}

router.get('/:driverId/movements', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;
    const { date } = req.query;
    // Día natural en hora de México (el servidor corre en UTC).
    const { from, to } = localDayRange(date);
    const movements = await prisma.driverCashMovement.findMany({
      where: { driverId: driver.id, createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: 'desc' },
    });
    const float = movements.filter(m => m.type === 'FLOAT').reduce((s, m) => s + m.amount, 0);
    const income = movements.filter(m => m.type === 'INCOME').reduce((s, m) => s + m.amount, 0);
    const expense = movements.filter(m => m.type === 'EXPENSE').reduce((s, m) => s + m.amount, 0);
    const returned = movements.filter(m => m.type === 'RETURN').reduce((s, m) => s + m.amount, 0);
    res.json({ movements, summary: { float, income, expense, returned, balance: float + income - expense - returned } });
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

// ── Pedidos del día asignados al repartidor ──────────────────────────────
// Lista pedido-por-pedido (folio, cliente, método de pago, total) leyendo
// directamente de orders por deliveryDriverId + fecha. Complementa el resumen
// de DriverCashMovement: aquí ves la venta real entregada aunque el cobro no
// se haya registrado como movimiento. Mismo control de acceso que movimientos.
router.get('/:driverId/orders', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;
    const { date } = req.query;
    // Día natural en hora de México (el servidor corre en UTC).
    const { from, to } = localDayRange(date);
    const restaurantId = req.restaurantId || req.user?.restaurantId;

    const orders = await prisma.order.findMany({
      where: {
        deliveryDriverId: driver.id,
        createdAt: { gte: from, lte: to },
        ...(req.user?.role !== 'SUPER_ADMIN' && restaurantId ? { restaurantId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, orderNumber: true, status: true,
        paymentMethod: true, paymentStatus: true,
        total: true, deliveryFee: true, tip: true, cashCollected: true,
        customerName: true, ticketName: true, customerPhone: true,
        deliveryAddress: true, createdAt: true,
      },
    });

    // Desglose por método de pago para el cuadre (efectivo es lo que el
    // repartidor debe entregar en caja).
    const byMethod = orders.reduce((acc, o) => {
      const k = o.paymentMethod || 'OTHER';
      acc[k] = (acc[k] || 0) + (o.total || 0);
      return acc;
    }, {});

    res.json({
      orders: orders.map(o => ({ ...o, customer: o.customerName || o.ticketName || null })),
      summary: {
        count: orders.length,
        total: orders.reduce((s, o) => s + (o.total || 0), 0),
        deliveryFees: orders.reduce((s, o) => s + (o.deliveryFee || 0), 0),
        tips: orders.reduce((s, o) => s + (o.tip || 0), 0),
        byMethod,
      },
    });
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

// ── Asignar fondo de cambio (caja chica) — sólo admin ────────────────────
// El repartidor no puede asignarse fondo a sí mismo: se registra como un
// movimiento FLOAT que suma al efectivo en mano sin contar como "cobrado".
router.post('/:driverId/float', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;
    const { amount, description } = req.body;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 50000) {
      return res.status(400).json({ error: 'amount invalido' });
    }
    const movement = await prisma.driverCashMovement.create({
      data: {
        driverId: driver.id,
        type: 'FLOAT',
        category: 'CAMBIO',
        amount: numericAmount,
        description: description || 'Fondo de cambio asignado',
      },
    });
    const io = req.app.get('io');
    if (io) io.to(`driver:${driver.id}`).emit('cashUpdated', { driverId: driver.id });
    res.json(movement);
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

router.post('/:driverId/movements', authenticate, requireTenantAccess, upload.single('photo'), async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;
    const { type, category, amount, description, orderId } = req.body;
    const numericAmount = Number(amount);
    if (!['INCOME', 'EXPENSE', 'RETURN'].includes(type)) return res.status(400).json({ error: 'type invalido' });
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 50000) {
      return res.status(400).json({ error: 'amount invalido' });
    }

    // Idempotencia: evita que un doble-tap o reintento de red cree movimientos
    // duplicados. Si ya existe un movimiento idéntico en los últimos 30s, lo
    // devolvemos en vez de crear otro.
    const dedupeFrom = new Date(Date.now() - 30 * 1000);
    const duplicate = await prisma.driverCashMovement.findFirst({
      where: {
        driverId: driver.id,
        type, category, amount: numericAmount,
        orderId: orderId || null,
        createdAt: { gte: dedupeFrom },
      },
    });
    if (duplicate) return res.json(duplicate);

    if (orderId) {
      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
          deliveryDriverId: driver.id,
          ...(req.user?.role !== 'SUPER_ADMIN' ? { restaurantId: req.restaurantId || req.user?.restaurantId } : {}),
        },
        select: { id: true },
      });
      if (!order) return res.status(404).json({ error: 'Orden no encontrada para este repartidor' });
    }

    const photoUrl = req.file ? await uploadPhoto(req.file.buffer, 'driver-cash') : null;

    // Si es un GASTO del repartidor (gasolina, etc.), reflejarlo en el corte
    // de caja: ese gasto se paga con efectivo que el cierre espera de vuelta
    // en caja (la venta de delivery ya cuenta como totalCash), así que debe
    // restar del efectivo esperado. Lo vinculamos al turno abierto de la
    // sucursal del repartidor creando un ShiftExpense + incrementando el cache
    // totalExpenses. El efectivo cobrado (INCOME) NO se toca: ya está contado
    // vía la venta de la orden, sumarlo sería doble-conteo.
    let openShift = null;
    if (type === 'EXPENSE' && driver.locationId) {
      openShift = await prisma.cashShift.findFirst({
        where: { locationId: driver.locationId, isOpen: true },
        orderBy: { openedAt: 'desc' },
        select: { id: true },
      });
    }

    const movement = await prisma.$transaction(async (tx) => {
      const mov = await tx.driverCashMovement.create({
        data: {
          driverId: driver.id,
          type,
          category,
          amount: numericAmount,
          description: description || null,
          photoUrl,
          orderId: orderId || null,
        },
      });
      if (openShift) {
        await tx.shiftExpense.create({
          data: {
            shiftId: openShift.id,
            description: `Repartidor ${driver.name}${description ? `: ${description}` : ''}`,
            amount: numericAmount,
            category: category || 'REPARTIDOR',
          },
        });
        await tx.cashShift.update({
          where: { id: openShift.id },
          data: { totalExpenses: { increment: numericAmount } },
        });
      }
      return mov;
    });
    res.json(movement);
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

router.post('/:driverId/collect', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;
    const { orderId, amount, orderNumber } = req.body;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 50000) {
      return res.status(400).json({ error: 'amount invalido' });
    }
    if (orderId) {
      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
          deliveryDriverId: driver.id,
          ...(req.user?.role !== 'SUPER_ADMIN' ? { restaurantId: req.restaurantId || req.user?.restaurantId } : {}),
        },
        select: { id: true },
      });
      if (!order) return res.status(404).json({ error: 'Orden no encontrada para este repartidor' });
      // Idempotencia por orden: un solo cobro de entrega por pedido.
      const existing = await prisma.driverCashMovement.findFirst({
        where: { driverId: driver.id, orderId, category: 'DELIVERY', type: 'INCOME' },
      });
      if (existing) return res.json(existing);
    } else {
      // Sin orderId: dedup por ventana de 30s para frenar reintentos.
      const dup = await prisma.driverCashMovement.findFirst({
        where: {
          driverId: driver.id, category: 'DELIVERY', type: 'INCOME',
          amount: numericAmount, orderId: null,
          createdAt: { gte: new Date(Date.now() - 30 * 1000) },
        },
      });
      if (dup) return res.json(dup);
    }
    const movement = await prisma.driverCashMovement.create({
      data: {
        driverId: driver.id,
        type: 'INCOME',
        category: 'DELIVERY',
        amount: numericAmount,
        description: 'Cobro entrega ' + (orderNumber || orderId || ''),
        orderId: orderId || null,
      },
    });
    res.json(movement);
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

// ── Solicitar cierre de turno ────────────────────────────────────────────
// El repartidor avisa al admin que quiere cerrar turno. No ejecuta el corte
// (eso sigue siendo requireAdmin); sólo crea una solicitud PENDING que el admin
// ve en /admin/caja-repartidores. Dedupe: una sola solicitud PENDING por driver.
router.post('/:driverId/shift-request', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;

    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const emp = await prisma.employee.findUnique({
      where: { id: driver.id },
      select: { locationId: true },
    });

    // Balance de hoy (mismo cálculo que ve el repartidor en su pantalla de caja).
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const to = new Date(); to.setHours(23, 59, 59, 999);
    const movements = await prisma.driverCashMovement.findMany({
      where: { driverId: driver.id, createdAt: { gte: from, lte: to } },
    });
    const float = movements.filter(m => m.type === 'FLOAT').reduce((s, m) => s + m.amount, 0);
    const income = movements.filter(m => m.type === 'INCOME').reduce((s, m) => s + m.amount, 0);
    const expense = movements.filter(m => m.type === 'EXPENSE').reduce((s, m) => s + m.amount, 0);
    const returned = movements.filter(m => m.type === 'RETURN').reduce((s, m) => s + m.amount, 0);
    const balance = float + income - expense - returned;

    const existing = await prisma.driverShiftRequest.findFirst({
      where: { driverId: driver.id, status: 'PENDING' },
    });
    const request = existing
      ? await prisma.driverShiftRequest.update({ where: { id: existing.id }, data: { balance } })
      : await prisma.driverShiftRequest.create({
          data: {
            restaurantId,
            locationId: emp?.locationId || null,
            driverId: driver.id,
            driverName: driver.name || 'Repartidor',
            balance,
          },
        });

    const io = req.app.get('io');
    if (io && restaurantId) {
      io.to(`restaurant:${restaurantId}:admins`).emit('driverShiftRequest', { request });
      io.to(`restaurant:${restaurantId}`).emit('driverShiftRequest', { request });
    }

    res.json(request);
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

// ── Solicitudes de cierre pendientes (admin) ─────────────────────────────
router.get('/shift-requests', authenticate, requireTenantAccess, requireRole('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const requests = await prisma.driverShiftRequest.findMany({
      where: { status: 'PENDING', ...(restaurantId ? { restaurantId } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    res.json(requests);
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

router.post('/:driverId/cut', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;
    const { notes } = req.body;
    const lastCut = await prisma.driverCashCut.findFirst({
      where: { driverId: driver.id }, orderBy: { createdAt: 'desc' },
    });
    const from = lastCut ? lastCut.createdAt : new Date(0);
    const movements = await prisma.driverCashMovement.findMany({
      where: { driverId: driver.id, createdAt: { gt: from } },
    });

    const float = movements.filter(m => m.type === 'FLOAT').reduce((s, m) => s + m.amount, 0);
    const income = movements.filter(m => m.type === 'INCOME').reduce((s, m) => s + m.amount, 0);
    const expense = movements.filter(m => m.type === 'EXPENSE').reduce((s, m) => s + m.amount, 0);
    const returned = movements.filter(m => m.type === 'RETURN').reduce((s, m) => s + m.amount, 0);

    const cut = await prisma.driverCashCut.create({
      data: {
        driverId: driver.id,
        driverName: driver.name || 'Repartidor',
        totalFloat: float,
        totalIncome: income,
        totalExpense: expense,
        totalReturn: returned,
        balance: float + income - expense - returned,
        movements: movements.length,
        notes: notes || null,
      },
    });

    await prisma.driverCashMovement.updateMany({
      where: { driverId: driver.id, createdAt: { gt: from } },
      data: { approved: true, approvedAt: new Date() },
    });

    // Resuelve cualquier solicitud de cierre pendiente del repartidor: el corte
    // ya se hizo, así que el aviso desaparece del panel admin.
    await prisma.driverShiftRequest.updateMany({
      where: { driverId: driver.id, status: 'PENDING' },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });

    res.json(cut);
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

router.get('/cuts', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const drivers = await prisma.employee.findMany({
      where: {
        role: 'DELIVERY',
        ...(req.user?.role !== 'SUPER_ADMIN' && restaurantId ? { location: { restaurantId } } : {}),
      },
      select: { id: true },
    });
    const cuts = await prisma.driverCashCut.findMany({
      where: { driverId: { in: drivers.map(d => d.id) } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(cuts);
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

router.get('/summary/today', authenticate, requireTenantAccess, requireRole('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const drivers = await prisma.employee.findMany({
      where: {
        role: 'DELIVERY',
        isActive: true,
        ...(req.user?.role !== 'SUPER_ADMIN' && restaurantId ? { location: { restaurantId } } : {}),
      },
    });
    const driverIds = drivers.map(d => d.id);
    const movements = await prisma.driverCashMovement.findMany({
      where: { driverId: { in: driverIds }, createdAt: { gte: from } },
    });
    const summary = drivers.map(d => {
      const dm = movements.filter(m => m.driverId === d.id);
      return {
        driver: { id: d.id, name: d.name, photo: d.photo },
        float: dm.filter(m => m.type === 'FLOAT').reduce((s, m) => s + m.amount, 0),
        income: dm.filter(m => m.type === 'INCOME').reduce((s, m) => s + m.amount, 0),
        expense: dm.filter(m => m.type === 'EXPENSE').reduce((s, m) => s + m.amount, 0),
        returned: dm.filter(m => m.type === 'RETURN').reduce((s, m) => s + m.amount, 0),
        deliveries: dm.filter(m => m.category === 'DELIVERY').length,
      };
    });
    res.json(summary);
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

// GET /api/driver-cash/pending-collection
// Pedidos ENTREGADOS pero sin cobrar (paidAt = null): efectivo que el
// repartidor aún trae o entregas "por cobrar". Quedan abiertos hasta que la
// caja confirme el cobro (PUT /api/orders/:id/confirm-cash).
router.get('/pending-collection', authenticate, requireTenantAccess, requireRole('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const orders = await prisma.order.findMany({
      where: {
        status: 'DELIVERED',
        paidAt: null,
        ...(req.user?.role !== 'SUPER_ADMIN' && restaurantId ? { restaurantId } : {}),
      },
      select: {
        id: true, orderNumber: true, total: true, paymentMethod: true,
        customerName: true, deliveryAddress: true, deliveryDriverId: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    // Order no tiene relación nombrada al repartidor (solo deliveryDriverId),
    // así que resolvemos los nombres en una sola consulta.
    const driverIds = [...new Set(orders.map(o => o.deliveryDriverId).filter(Boolean))];
    const drivers = driverIds.length
      ? await prisma.employee.findMany({ where: { id: { in: driverIds } }, select: { id: true, name: true } })
      : [];
    const driverName = Object.fromEntries(drivers.map(d => [d.id, d.name]));

    res.json(orders.map(o => ({
      id: o.id,
      orderNumber: o.orderNumber,
      total: o.total,
      paymentMethod: o.paymentMethod,
      customerName: o.customerName,
      deliveryAddress: o.deliveryAddress,
      driverName: o.deliveryDriverId ? (driverName[o.deliveryDriverId] || null) : null,
      updatedAt: o.updatedAt,
    })));
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

module.exports = router;
