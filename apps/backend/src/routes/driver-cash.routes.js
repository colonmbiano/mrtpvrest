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
    // Por defecto mostramos lo PENDIENTE DE CORTE (movimientos no aprobados =
    // desde el último corte), NO "hoy". Los turnos cruzan la medianoche y el
    // corte se hace de madrugada; filtrar por día natural escondía las entregas
    // de antes de las 00:00 y descuadraba la caja por debajo. Si llega ?date= se
    // respeta la vista histórica por día natural de México.
    let where;
    if (date) {
      const { from, to } = localDayRange(date);
      where = { driverId: driver.id, createdAt: { gte: from, lte: to } };
    } else {
      where = { driverId: driver.id, approved: false };
    }
    const movements = await prisma.driverCashMovement.findMany({
      where,
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
    const restaurantId = req.restaurantId || req.user?.restaurantId;

    // Ventana de pedidos:
    //  - Con ?date: día natural en hora de México (vista histórica).
    //  - Sin ?date: PENDIENTE DE CORTE — pedidos desde el último corte del
    //    repartidor (no por día natural: los turnos cruzan medianoche y el
    //    corte se hace de madrugada). Así "pedidos" cuadra con los movimientos
    //    (approved=false) y no se vacía después de las 00:00. Si nunca hubo
    //    corte, tope de seguridad de 7 días para no traer todo el histórico.
    let createdAtRange;
    if (date) {
      const { from, to } = localDayRange(date);
      createdAtRange = { gte: from, lte: to };
    } else {
      const lastCut = await prisma.driverCashCut.findFirst({
        where: { driverId: driver.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const floor = lastCut?.createdAt || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      createdAtRange = { gt: floor };
    }

    const orders = await prisma.order.findMany({
      where: {
        deliveryDriverId: driver.id,
        createdAt: createdAtRange,
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
    // El fondo de cambio es efectivo REAL de la caja que pasa a manos del
    // repartidor. Se refleja como ShiftCashIn en el turno abierto para que "sume
    // al total de la caja": el cierre lo espera de vuelta (como efectivo + el
    // gasto que se haya cubierto con él). Mismo criterio que el fondo para
    // compras en POST /movements; evita el sobrante fantasma.
    let openShift = null;
    if (driver.locationId) {
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
          type: 'FLOAT',
          category: 'CAMBIO',
          amount: numericAmount,
          description: description || 'Fondo de cambio asignado',
        },
      });
      if (openShift) {
        await tx.shiftCashIn.create({
          data: {
            shiftId: openShift.id,
            description: `Fondo repartidor ${driver.name}${description ? `: ${description}` : ''}`,
            amount: numericAmount,
            category: 'FONDO_REPARTIDOR',
          },
        });
        await tx.cashShift.update({
          where: { id: openShift.id },
          data: { totalCashIn: { increment: numericAmount } },
        });
      }
      return mov;
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

    // Reflejo en el corte de la CAJA PRINCIPAL según el tipo de movimiento.
    // Regla de oro (modelo de una sola caja, sin doble gasto ni doble ingreso):
    //
    //  - GASTO del repartidor → ShiftExpense (resta del efectivo esperado): ese
    //    gasto se cubre con efectivo de la caja (fondo entregado o efectivo de
    //    entregas que el cierre espera de vuelta), así que debe restar.
    //
    //  - INGRESO que NO es cobro de entrega (p. ej. el FONDO PARA COMPRAS que la
    //    caja le entrega al repartidor) → ShiftCashIn (suma al efectivo esperado):
    //    es dinero REAL de la caja, solo que en manos del repartidor. Debe "sumar
    //    al total de la caja" para que el gasto que salga de ese fondo quede
    //    respaldado. SIN esto, el gasto se restaba del esperado sin haber sumado
    //    el fondo con que se pagó → aparecía un SOBRANTE fantasma en el cajón.
    //
    //  - Cobro de entrega (INCOME category 'DELIVERY') → NO se refleja aquí: ya
    //    está contado vía totalCash de la venta de la orden; reflejarlo sería
    //    DOBLE INGRESO. (Además esos llegan por POST /collect, no por aquí.)
    const mirrorsExpense = type === 'EXPENSE';
    const mirrorsCashIn = type === 'INCOME' && category !== 'DELIVERY';
    let openShift = null;
    if ((mirrorsExpense || mirrorsCashIn) && driver.locationId) {
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
      if (openShift && mirrorsExpense) {
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
      if (openShift && mirrorsCashIn) {
        await tx.shiftCashIn.create({
          data: {
            shiftId: openShift.id,
            description: `Fondo repartidor ${driver.name}${description ? `: ${description}` : ''}`,
            amount: numericAmount,
            category: 'FONDO_REPARTIDOR',
          },
        });
        await tx.cashShift.update({
          where: { id: openShift.id },
          data: { totalCashIn: { increment: numericAmount } },
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

    // Balance PENDIENTE DE CORTE (mismo criterio que la pantalla de caja y que
    // el corte real): movimientos no aprobados desde el último corte. No por
    // día, para no esconder turnos que cruzan medianoche.
    const movements = await prisma.driverCashMovement.findMany({
      where: { driverId: driver.id, approved: false },
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

router.post('/:driverId/cut', authenticate, requireTenantAccess, requireRole('ADMIN', 'SUPER_ADMIN', 'OWNER', 'MANAGER'), async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;
    const { notes } = req.body;
    // El corte toma EXACTAMENTE los movimientos pendientes (no aprobados) desde
    // el último corte — el mismo conjunto que se muestra en las vistas de caja,
    // así lo que ves es lo que se corta. Se marcan por id (no por ventana de
    // tiempo) para que un movimiento creado durante el corte no quede aprobado
    // sin haberse contado.
    const movements = await prisma.driverCashMovement.findMany({
      where: { driverId: driver.id, approved: false },
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
      where: { id: { in: movements.map(m => m.id) } },
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
    const drivers = await prisma.employee.findMany({
      where: {
        role: 'DELIVERY',
        isActive: true,
        ...(req.user?.role !== 'SUPER_ADMIN' && restaurantId ? { location: { restaurantId } } : {}),
      },
    });
    const driverIds = drivers.map(d => d.id);
    // Pendiente de corte (no "hoy"): ver nota en GET /:driverId/movements. Así el
    // resumen del panel coincide con lo que el corte realmente va a tomar.
    const movements = await prisma.driverCashMovement.findMany({
      where: { driverId: { in: driverIds }, approved: false },
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

// ── Lista de repartidores activos (admin) ────────────────────────────────
// Alimenta el selector del reporte de repartidores. Devuelve los DELIVERY
// activos de la sucursal/restaurante (todos, para poder consultar días
// históricos), pero ORDENADOS por actividad de hoy: los que tienen pedidos
// primero, así el selector arranca en uno con datos y no en un repartidor
// inactivo (que mostraba "Sin pedidos" engañoso). Incluye `ordersToday`.
router.get('/drivers', authenticate, requireTenantAccess, requireRole('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const scoped = req.user?.role !== 'SUPER_ADMIN' && restaurantId;
    const drivers = await prisma.employee.findMany({
      where: {
        role: 'DELIVERY',
        isActive: true,
        ...(scoped ? { location: { restaurantId } } : {}),
      },
      select: { id: true, name: true, photo: true, locationId: true },
    });

    // Conteo de pedidos de HOY por repartidor (día natural MX) para ordenar.
    const { from, to } = localDayRange();
    const ids = drivers.map((d) => d.id);
    const counts = ids.length
      ? await prisma.order.groupBy({
          by: ['deliveryDriverId'],
          where: {
            deliveryDriverId: { in: ids },
            createdAt: { gte: from, lte: to },
            ...(scoped ? { restaurantId } : {}),
          },
          _count: { id: true },
        })
      : [];
    const countByDriver = Object.fromEntries(counts.map((c) => [c.deliveryDriverId, c._count.id]));

    const enriched = drivers
      .map((d) => ({ ...d, ordersToday: countByDriver[d.id] || 0 }))
      .sort((a, b) => b.ordersToday - a.ordersToday || a.name.localeCompare(b.name));
    res.json(enriched);
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

// Detecta las categorías de "envío" del restaurante por nombre (Envíos,
// Domicilio, Flete, Reparto…). Es por-tenant y tolerante a acentos/variantes,
// así no dependemos de adivinar por el nombre del producto (que es libre:
// "Local", "San juan", "envio rincon sifon"…). Memoizar no hace falta: una
// consulta por reporte es barata.
async function getShippingCategoryIds(restaurantId) {
  if (!restaurantId) return new Set();
  const cats = await prisma.category.findMany({
    where: {
      restaurantId,
      OR: [
        { name: { contains: 'nvio', mode: 'insensitive' } },  // Envio / Envío (sin la E inicial para cubrir acento)
        { name: { contains: 'nvío', mode: 'insensitive' } },
        { name: { contains: 'omicilio', mode: 'insensitive' } },
        { name: { contains: 'lete', mode: 'insensitive' } },  // Flete / Fletes
        { name: { contains: 'eparto', mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  return new Set(cats.map(c => c.id));
}

// ── Reporte consolidado por repartidor y día (admin) ─────────────────────
// Una sola llamada devuelve todo lo que la pantalla de "Reporte de
// Repartidores" necesita, ya cuadrado server-side:
//  - cashSummary: lo PENDIENTE DE CORTE (movimientos approved=false), igual
//    criterio que el corte real, para que el número coincida con lo que se va
//    a cortar (no por día — los turnos cruzan medianoche).
//  - lastCut: si el repartidor ya tuvo un corte EN ESE día natural, para
//    explicar el desfase cuando la caja ya se cortó pero los pedidos siguen
//    abiertos (caso real visto en operación).
//  - orders: los pedidos del día natural (TZ México), pedido por pedido.
//  - shipping: desglose de las líneas de la categoría "Envíos" por zona.
// Mismo control de acceso que el resto del módulo (assertDriverAccess).
router.get('/:driverId/report', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const scoped = req.user?.role !== 'SUPER_ADMIN' && restaurantId;
    const { from, to } = localDayRange(req.query.date);

    const [orders, pendingMovements, cuts, shippingCatIds] = await Promise.all([
      prisma.order.findMany({
        where: {
          deliveryDriverId: driver.id,
          createdAt: { gte: from, lte: to },
          ...(scoped ? { restaurantId } : {}),
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, orderNumber: true, status: true,
          paymentMethod: true, paymentStatus: true,
          total: true, deliveryFee: true, tip: true, cashCollected: true, paidAt: true,
          customerName: true, ticketName: true, customerPhone: true,
          deliveryAddress: true, createdAt: true,
          items: {
            select: {
              name: true, quantity: true, price: true, subtotal: true,
              menuItem: { select: { categoryId: true } },
            },
          },
        },
      }),
      // Pendiente de corte: independiente del día (ver nota en GET /movements).
      prisma.driverCashMovement.findMany({ where: { driverId: driver.id, approved: false } }),
      // Cortes hechos dentro del día consultado.
      prisma.driverCashCut.findMany({
        where: { driverId: driver.id, createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: 'desc' },
      }),
      getShippingCategoryIds(restaurantId),
    ]);

    // ── Resumen de caja PENDIENTE DE CORTE ──────────────────────────────
    const cashSummary = {
      float: pendingMovements.filter(m => m.type === 'FLOAT').reduce((s, m) => s + m.amount, 0),
      income: pendingMovements.filter(m => m.type === 'INCOME').reduce((s, m) => s + m.amount, 0),
      expense: pendingMovements.filter(m => m.type === 'EXPENSE').reduce((s, m) => s + m.amount, 0),
      returned: pendingMovements.filter(m => m.type === 'RETURN').reduce((s, m) => s + m.amount, 0),
      movements: pendingMovements.length,
    };
    cashSummary.balance = cashSummary.float + cashSummary.income - cashSummary.expense - cashSummary.returned;

    // ── Pedidos + clasificación de líneas de envío ──────────────────────
    const lineAmount = (it) => (typeof it.subtotal === 'number' && it.subtotal > 0)
      ? it.subtotal
      : (it.price || 0) * (it.quantity || 0);

    const zoneTotals = new Map(); // zona -> { zone, count, amount }
    let shippingTotal = 0;
    const ordersWithoutShipping = [];

    const outOrders = orders.map(o => {
      const shipItems = o.items.filter(it => it.menuItem && shippingCatIds.has(it.menuItem.categoryId));
      let orderShipping = 0;
      for (const it of shipItems) {
        const amt = lineAmount(it);
        orderShipping += amt;
        const zone = (it.name || 'Envío').trim();
        const cur = zoneTotals.get(zone) || { zone, count: 0, amount: 0 };
        cur.count += it.quantity || 1;
        cur.amount += amt;
        zoneTotals.set(zone, cur);
      }
      shippingTotal += orderShipping;
      if (shipItems.length === 0) ordersWithoutShipping.push(o.orderNumber);
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        customer: o.customerName || o.ticketName || null,
        phone: o.customerPhone || null,
        address: o.deliveryAddress || null,
        paymentMethod: o.paymentMethod || null,
        paymentStatus: o.paymentStatus || null,
        status: o.status,
        total: o.total || 0,
        deliveryFee: o.deliveryFee || 0,
        tip: o.tip || 0,
        cashCollected: o.cashCollected,
        paidAt: o.paidAt,
        createdAt: o.createdAt,
        shipping: orderShipping,
        shippingZones: shipItems.map(it => it.name),
      };
    });

    // ── Resumen de pedidos (cuadre) ─────────────────────────────────────
    const byMethod = {};
    const byStatus = {};
    let paidTotal = 0, pendingTotal = 0;
    for (const o of outOrders) {
      const m = o.paymentMethod || 'OTHER';
      byMethod[m] = (byMethod[m] || 0) + o.total;
      byStatus[o.status] = (byStatus[o.status] || 0) + 1;
      if (o.paymentStatus === 'PAID') paidTotal += o.total;
      else pendingTotal += o.total;
    }

    res.json({
      driver: { id: driver.id, name: driver.name },
      date: req.query.date || null,
      range: { from, to },
      cashSummary,
      lastCut: cuts[0] || null,
      orders: outOrders,
      ordersSummary: {
        count: outOrders.length,
        total: outOrders.reduce((s, o) => s + o.total, 0),
        paid: paidTotal,
        pending: pendingTotal,
        deliveryFees: outOrders.reduce((s, o) => s + o.deliveryFee, 0),
        tips: outOrders.reduce((s, o) => s + o.tip, 0),
        byMethod,
        byStatus,
      },
      shipping: {
        total: shippingTotal,
        byZone: [...zoneTotals.values()].sort((a, b) => b.amount - a.amount),
        ordersWithoutShipping,
      },
    });
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

// ── Inventariar una COMPRA de repartidor (entrada de stock, SIN dinero) ───
// La COMPRAS del repartidor ya quedó como gasto en efectivo (DriverCashMovement
// EXPENSE, que reduce su corte). Esto agrega SOLO el inventario: incrementa
// Ingredient.stock + crea StockMovement, sin tocar dinero (NO crea PurchaseOrder
// ni ShiftExpense) → cero doble conteo en los reportes de gasto.
// Idempotente por movementId (un inventariado por movimiento): si ya se hizo,
// devuelve alreadyDone. Esto lo hace seguro contra el replay offline del TPV
// (mismo Idempotency-Key reentra sin duplicar stock).
router.post('/inventory-in', authenticate, requireTenantAccess, requireRole('ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const scoped = req.user?.role !== 'SUPER_ADMIN' && restaurantId;
    const { movementId, items } = req.body || {};
    if (!movementId) return res.status(400).json({ error: 'movementId requerido' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items requerido (mínimo 1)' });

    // El movimiento debe ser un EXPENSE de un repartidor del restaurante.
    const movement = await prisma.driverCashMovement.findUnique({
      where: { id: movementId },
      select: { id: true, driverId: true, type: true },
    });
    if (!movement || movement.type !== 'EXPENSE') {
      return res.status(404).json({ error: 'Movimiento de gasto no encontrado' });
    }
    const driver = await prisma.employee.findFirst({
      where: { id: movement.driverId, role: 'DELIVERY', ...(scoped ? { location: { restaurantId } } : {}) },
      select: { id: true, name: true, locationId: true },
    });
    if (!driver) return res.status(404).json({ error: 'Repartidor no encontrado' });

    // Idempotencia natural: un solo inventariado por movimiento. Sobrevive a
    // reinicios del server (a diferencia del Idempotency-Key in-memory).
    const already = await prisma.stockMovement.findFirst({
      where: { refType: 'driverExpense', refId: movementId },
      select: { id: true },
    });
    if (already) return res.json({ ok: true, alreadyDone: true });

    // Validar ingredientes (que pertenezcan al restaurante) y cantidades.
    const ids = [...new Set(items.map((i) => i.ingredientId).filter(Boolean))];
    const ingredients = await prisma.ingredient.findMany({
      where: { id: { in: ids }, ...(scoped ? { restaurantId } : {}) },
      select: { id: true, name: true, baseUnit: true, locationId: true },
    });
    const ingMap = new Map(ingredients.map((i) => [i.id, i]));
    const normalized = [];
    for (const it of items) {
      const ing = ingMap.get(it.ingredientId);
      const qty = Number(it.qty);
      if (!ing) return res.status(400).json({ error: `Ingrediente no válido: ${it.ingredientId}` });
      if (!Number.isFinite(qty) || qty <= 0 || qty > 1000000) return res.status(400).json({ error: 'qty inválida' });
      normalized.push({ ing, qty });
    }

    const created = await prisma.$transaction(async (tx) => {
      const out = [];
      for (const { ing, qty } of normalized) {
        const updated = await tx.ingredient.update({
          where: { id: ing.id },
          data: { stock: { increment: qty } },
          select: { stock: true },
        });
        await tx.stockMovement.create({
          data: {
            ingredientId: ing.id,
            locationId: ing.locationId || driver.locationId,
            delta: qty,
            unit: ing.baseUnit,
            reason: 'PURCHASE',
            refType: 'driverExpense',
            refId: movementId,
            balanceAfter: Number(updated.stock),
            userId: null, // El TPV autentica como Employee, no User (FK a users rompe).
            notes: `Compra repartidor ${driver.name}`,
          },
        });
        out.push(ing.name);
      }
      return out;
    });

    res.json({ ok: true, inventoried: created });
  } catch (e) { console.error(req.method, req.originalUrl, e); res.status(500).json({ error: 'Error interno' }); }
});

module.exports = router;
