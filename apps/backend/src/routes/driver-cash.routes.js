const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const prisma = new PrismaClient();
const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// POST subir foto a cloudinary
async function uploadPhoto(buffer, folder) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({ folder }, (err, result) => {
      if (err) reject(err);
      else resolve(result.secure_url);
    }).end(buffer);
  });
}

// ── GET movimientos del repartidor ────────────────────────────────────────
router.get('/:driverId/movements', async (req, res) => {
  try {
    const { date } = req.query;
    const from = date ? new Date(date) : new Date(new Date().setHours(0,0,0,0));
    const to   = date ? new Date(new Date(date).setHours(23,59,59,999)) : new Date(new Date().setHours(23,59,59,999));
    const movements = await prisma.driverCashMovement.findMany({
      where: { driverId: req.params.driverId, createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: 'desc' }
    });
    // Calcular resumen
    const income  = movements.filter(m => m.type === 'INCOME').reduce((s,m) => s + m.amount, 0);
    const expense = movements.filter(m => m.type === 'EXPENSE').reduce((s,m) => s + m.amount, 0);
    const returned = movements.filter(m => m.type === 'RETURN').reduce((s,m) => s + m.amount, 0);
    res.json({ movements, summary: { income, expense, returned, balance: income - expense - returned } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST registrar movimiento ─────────────────────────────────────────────
router.post('/:driverId/movements', upload.single('photo'), async (req, res) => {
  try {
    const { type, category, amount, description, orderId } = req.body;
    let photoUrl = null;
    if (req.file) {
      photoUrl = await uploadPhoto(req.file.buffer, 'driver-cash');
    }
    const movement = await prisma.driverCashMovement.create({
      data: {
        driverId: req.params.driverId,
        type, category,
        amount: Number(amount),
        description: description || null,
        photoUrl,
        orderId: orderId || null,
      }
    });
    res.json(movement);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST registrar cobro de entrega (automático al entregar) ──────────────
router.post('/:driverId/collect', async (req, res) => {
  try {
    const { orderId, amount, orderNumber } = req.body;
    const movement = await prisma.driverCashMovement.create({
      data: {
        driverId: req.params.driverId,
        type: 'INCOME',
        category: 'DELIVERY',
        amount: Number(amount),
        description: 'Cobro entrega ' + orderNumber,
        orderId: orderId || null,
      }
    });
    res.json(movement);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST solicitar corte de caja ──────────────────────────────────────────
router.post('/:driverId/cut', authenticate, requireAdmin, async (req, res) => {
  try {
    const { driverId } = req.params;
    const { notes } = req.body;

    // Buscar empleado
    const driver = await prisma.employee.findUnique({ where: { id: driverId } });

    // Calcular movimientos del día sin corte previo
    const lastCut = await prisma.driverCashCut.findFirst({
      where: { driverId }, orderBy: { createdAt: 'desc' }
    });
    const from = lastCut ? lastCut.createdAt : new Date(0);

    const movements = await prisma.driverCashMovement.findMany({
      where: { driverId, createdAt: { gt: from } }
    });

    const income   = movements.filter(m => m.type === 'INCOME').reduce((s,m) => s + m.amount, 0);
    const expense  = movements.filter(m => m.type === 'EXPENSE').reduce((s,m) => s + m.amount, 0);
    const returned = movements.filter(m => m.type === 'RETURN').reduce((s,m) => s + m.amount, 0);

    const cut = await prisma.driverCashCut.create({
      data: {
        driverId,
        driverName: driver?.name || 'Repartidor',
        totalIncome:  income,
        totalExpense: expense,
        totalReturn:  returned,
        balance:      income - expense - returned,
        movements:    movements.length,
        notes: notes || null,
      }
    });

    // Marcar movimientos como aprobados
    await prisma.driverCashMovement.updateMany({
      where: { driverId, createdAt: { gt: from } },
      data: { approved: true, approvedAt: new Date() }
    });

    res.json(cut);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET historial de cortes (admin) ──────────────────────────────────────
router.get('/cuts', authenticate, requireAdmin, async (req, res) => {
  try {
    const cuts = await prisma.driverCashCut.findMany({
      orderBy: { createdAt: 'desc' }, take: 50
    });
    res.json(cuts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET resumen de todos los repartidores hoy (admin) ────────────────────
router.get('/summary/today', authenticate, requireAdmin, async (req, res) => {
  try {
    const from = new Date(); from.setHours(0,0,0,0);
    const movements = await prisma.driverCashMovement.findMany({
      where: { createdAt: { gte: from } }
    });
    const drivers = await prisma.employee.findMany({ where: { role: 'DELIVERY', isActive: true } });
    const summary = drivers.map(d => {
      const dm = movements.filter(m => m.driverId === d.id);
      return {
        driver: { id: d.id, name: d.name, photo: d.photo },
        income:   dm.filter(m => m.type === 'INCOME').reduce((s,m) => s + m.amount, 0),
        expense:  dm.filter(m => m.type === 'EXPENSE').reduce((s,m) => s + m.amount, 0),
        returned: dm.filter(m => m.type === 'RETURN').reduce((s,m) => s + m.amount, 0),
        deliveries: dm.filter(m => m.category === 'DELIVERY').length,
      };
    });
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
