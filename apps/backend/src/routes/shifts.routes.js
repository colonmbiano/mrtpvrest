const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const prisma = new PrismaClient();
const router = express.Router();

// ── GET turno activo actual ───────────────────────────────────────────────
router.get('/active', authenticate, async (req, res) => {
  try {
    const shift = await prisma.cashShift.findFirst({
      where: { isOpen: true },
      include: { expenses: { orderBy: { createdAt: 'desc' } } },
      orderBy: { openedAt: 'desc' }
    });
    res.json(shift || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST abrir turno ──────────────────────────────────────────────────────
router.post('/open', authenticate, async (req, res) => {
  try {
    const { openingFloat, employeeId, employeeName } = req.body;
    // Cerrar cualquier turno abierto antes
    await prisma.cashShift.updateMany({
      where: { isOpen: true },
      data: { isOpen: false, closedAt: new Date() }
    });
    const shift = await prisma.cashShift.create({
      data: {
        employeeId: employeeId || 'unknown',
        employeeName: employeeName || 'Cajero',
        openingFloat: openingFloat || 0,
        isOpen: true,
      },
      include: { expenses: true }
    });
    res.json(shift);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST cerrar turno ─────────────────────────────────────────────────────
router.post('/:id/close', authenticate, async (req, res) => {
  try {
    const { closingFloat, notes } = req.body;
    const shiftId = req.params.id;

    // Obtener todas las órdenes del turno
    const shift = await prisma.cashShift.findUnique({
      where: { id: shiftId },
      include: { expenses: true }
    });
    if (!shift) return res.status(404).json({ error: 'Turno no encontrado' });

    const orders = await prisma.order.findMany({
      where: {
        status: 'DELIVERED',
        createdAt: { gte: shift.openedAt },
        source: { in: ['TPV', 'WAITER', 'ONLINE'] }
      }
    });

    const pmMap = {
      CASH: 'totalCash', CASH_ON_DELIVERY: 'totalCash',
      CARD_PRESENT: 'totalCard', CARD: 'totalCard',
      TRANSFER: 'totalTransfer', SPEI: 'totalTransfer', OXXO: 'totalTransfer',
      COURTESY: 'totalCourtesy',
    };

    const totals = { totalCash: 0, totalCard: 0, totalTransfer: 0, totalCourtesy: 0 };
    for (const order of orders) {
      const key = pmMap[order.paymentMethod];
      if (key) totals[key] += Number(order.total);
    }

    const totalExpenses = shift.expenses.reduce((s, e) => s + e.amount, 0);
    const totalSales = Object.values(totals).reduce((a, b) => a + b, 0);

    const closed = await prisma.cashShift.update({
      where: { id: shiftId },
      data: {
        isOpen: false,
        closedAt: new Date(),
        closingFloat: closingFloat || 0,
        notes: notes || null,
        ...totals,
        totalExpenses,
        totalSales,
        ordersCount: orders.length,
      },
      include: { expenses: true }
    });
    res.json(closed);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST agregar gasto al turno ───────────────────────────────────────────
router.post('/:id/expenses', authenticate, async (req, res) => {
  try {
    const { description, amount, category } = req.body;
    const expense = await prisma.shiftExpense.create({
      data: {
        shiftId: req.params.id,
        description,
        amount: Number(amount),
        category: category || 'OTHER'
      }
    });
    res.json(expense);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE gasto ──────────────────────────────────────────────────────────
router.delete('/expenses/:id', authenticate, async (req, res) => {
  try {
    await prisma.shiftExpense.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET historial de turnos (admin) ──────────────────────────────────────
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const shifts = await prisma.cashShift.findMany({
      orderBy: { openedAt: 'desc' },
      take: 100,
      include: { expenses: true }
    });
    res.json(shifts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET un turno específico ───────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const shift = await prisma.cashShift.findUnique({
      where: { id: req.params.id },
      include: { expenses: { orderBy: { createdAt: 'desc' } } }
    });
    if (!shift) return res.status(404).json({ error: 'No encontrado' });
    res.json(shift);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;