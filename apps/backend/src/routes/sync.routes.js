const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireTenantAccess } = require('../middleware/auth.middleware');
const router = express.Router();

// POST /api/sync/transaction — Sincroniza una transacción offline
router.post('/transaction', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const { id: offlineId, type, data, timestamp, supervisor } = req.body;
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const locationId = req.locationId || req.headers['x-location-id'];

    if (!offlineId || !type) return res.status(400).json({ error: 'Datos de sync incompletos' });

    // 1. Evitar duplicados (idempotencia)
    // Verificamos si ya existe un log de acceso con este offlineId
    const existingLog = await prisma.accessLog.findFirst({
      where: { resource: `offline:${offlineId}` }
    });
    if (existingLog) return res.json({ ok: true, note: 'Ya sincronizado previously' });

    // 2. Procesar según tipo
    if (type === 'order') {
      // TODO: Implementar creación batch de orden
      // Por ahora registramos el evento
    }

    if (type === 'override') {
      await prisma.accessLog.create({
        data: {
          tenantId: req.tenant?.id || 'unknown',
          restaurantId,
          locationId,
          actorType: 'EMPLOYEE',
          actorId: supervisor, // ID del supervisor que autorizó
          action: 'MANAGER_OVERRIDE',
          resource: `offline:${offlineId}`,
          after: data, // { permission: 'void_item', etc }
          reason: 'Sincronización offline',
          createdAt: new Date(timestamp)
        }
      });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('Sync Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
