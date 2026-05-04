const express = require('express');
const crypto = require('crypto');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireTenantAccess } = require('../middleware/auth.middleware');
const router = express.Router();

// POST /api/devices/create — Vincular un nuevo dispositivo (Hardware Provisioning)
router.post('/create', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const { locationId: bodyLocationId, deviceType, restaurantId: bodyRestaurantId } = req.body;
    
    const locationId = req.locationId || bodyLocationId;
    const restaurantId = req.restaurantId || req.user?.restaurantId || bodyRestaurantId;

    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada (locationId faltante)' });
    if (!deviceType) return res.status(400).json({ error: 'Tipo de dispositivo no proporcionado' });

    // Determinar el tenantId a partir del restaurante.
    // Ojo: el middleware setea `req.tenant = { ...restaurant, tenant }`, así
    // que `req.tenant.id` es el id del Restaurant, NO del Tenant. Usamos
    // `req.restaurant.tenantId` que sí es el id correcto del tenant.
    let tenantId = req.restaurant?.tenantId;
    if (!tenantId && restaurantId) {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { tenantId: true }
      });
      tenantId = restaurant?.tenantId;
    }

    if (!tenantId) {
       // Buscar a través de la location
       const loc = await prisma.location.findUnique({
         where: { id: locationId },
         include: { restaurant: { select: { tenantId: true } } }
       });
       tenantId = loc?.restaurant?.tenantId;
    }

    if (!tenantId) return res.status(400).json({ error: 'No se pudo resolver el tenant de esta sucursal' });

    // Verificar que el tenant existe ANTES de crear el device. Sin esto, una
    // FK huérfana (restaurant.tenantId apuntando a un tenant ya borrado)
    // explota como `Foreign key constraint violated: devices_tenantId_fkey`,
    // un mensaje opaco que no permite diagnosticar.
    const tenantExists = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenantExists) {
      return res.status(409).json({
        error: `Inconsistencia: el restaurante referencia un tenant inexistente (tenantId=${tenantId}). Contacta soporte.`,
        code: 'ORPHAN_TENANT',
        tenantId,
        restaurantId,
      });
    }

    // Generar device token
    const deviceToken = crypto.randomBytes(32).toString('hex');

    const device = await prisma.device.create({
      data: {
        tenantId,
        locationId,
        type: deviceType,
        name: `${deviceType} - ${new Date().toISOString().split('T')[0]}`,
        deviceToken,
        isActive: true
      }
    });

    res.json({
      deviceId: device.id,
      deviceToken
    });

  } catch (e) {
    console.error('Error en /api/devices/create:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
