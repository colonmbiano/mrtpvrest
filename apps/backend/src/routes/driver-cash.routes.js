const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
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
    select: { id: true, name: true },
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
    const from = date ? new Date(date) : new Date(new Date().setHours(0, 0, 0, 0));
    const to = date ? new Date(new Date(date).setHours(23, 59, 59, 999)) : new Date(new Date().setHours(23, 59, 59, 999));
    const movements = await prisma.driverCashMovement.findMany({
      where: { driverId: driver.id, createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: 'desc' },
    });
    const income = movements.filter(m => m.type === 'INCOME').reduce((s, m) => s + m.amount, 0);
    const expense = movements.filter(m => m.type === 'EXPENSE').reduce((s, m) => s + m.amount, 0);
    const returned = movements.filter(m => m.type === 'RETURN').reduce((s, m) => s + m.amount, 0);
    res.json({ movements, summary: { income, expense, returned, balance: income - expense - returned } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:driverId/movements', authenticate, requireTenantAccess, upload.single('photo'), async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;
    const { type, category, amount, description, orderId } = req.body;
    const numericAmount = Number(amount);
    if (!['INCOME', 'EXPENSE', 'RETURN'].includes(type)) return res.status(400).json({ error: 'type invalido' });
    if (!Number.isFinite(numericAmount) || numericAmount < 0 || numericAmount > 50000) {
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
    }

    const photoUrl = req.file ? await uploadPhoto(req.file.buffer, 'driver-cash') : null;
    const movement = await prisma.driverCashMovement.create({
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
    res.json(movement);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:driverId/collect', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const driver = await assertDriverAccess(req, res);
    if (!driver) return;
    const { orderId, amount, orderNumber } = req.body;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0 || numericAmount > 50000) {
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
      const existing = await prisma.driverCashMovement.findFirst({
        where: { driverId: driver.id, orderId, category: 'DELIVERY', type: 'INCOME' },
      });
      if (existing) return res.json(existing);
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
  } catch (e) { res.status(500).json({ error: e.message }); }
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

    const income = movements.filter(m => m.type === 'INCOME').reduce((s, m) => s + m.amount, 0);
    const expense = movements.filter(m => m.type === 'EXPENSE').reduce((s, m) => s + m.amount, 0);
    const returned = movements.filter(m => m.type === 'RETURN').reduce((s, m) => s + m.amount, 0);

    const cut = await prisma.driverCashCut.create({
      data: {
        driverId: driver.id,
        driverName: driver.name || 'Repartidor',
        totalIncome: income,
        totalExpense: expense,
        totalReturn: returned,
        balance: income - expense - returned,
        movements: movements.length,
        notes: notes || null,
      },
    });

    await prisma.driverCashMovement.updateMany({
      where: { driverId: driver.id, createdAt: { gt: from } },
      data: { approved: true, approvedAt: new Date() },
    });

    res.json(cut);
  } catch (e) { res.status(500).json({ error: e.message }); }
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/summary/today', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
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
        income: dm.filter(m => m.type === 'INCOME').reduce((s, m) => s + m.amount, 0),
        expense: dm.filter(m => m.type === 'EXPENSE').reduce((s, m) => s + m.amount, 0),
        returned: dm.filter(m => m.type === 'RETURN').reduce((s, m) => s + m.amount, 0),
        deliveries: dm.filter(m => m.category === 'DELIVERY').length,
      };
    });
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
