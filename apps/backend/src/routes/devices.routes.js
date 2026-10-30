const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { prisma, runWithBypass } = require('@mrtpvrest/database');
const { authenticate, requireTenantAccess } = require('../middleware/auth.middleware');
const router = express.Router();

// POST /api/devices/auth — Canjea un deviceToken por un JWT de máquina.
//
// Útil para terminales sin login humano (KDS de cocina). El JWT generado
// usa role='KITCHEN' por convención cuando Device.type === 'KDS'; para
// otros tipos se respeta el rol implícito ('CASHIER' / 'WAITER').
//
// El JWT incluye `isDevice:true` para que el middleware de auth pueda
// distinguirlo de un usuario humano. Las rutas críticas que requieran
// rol humano deberán verificar ese flag explícitamente.
router.post('/auth', async (req, res) => {
  try {
    const { deviceToken } = req.body || {};
    if (!deviceToken || typeof deviceToken !== 'string') {
      return res.status(400).json({ error: 'deviceToken requerido' });
    }

    const device = await prisma.device.findUnique({
      where: { deviceToken },
      include: {
        location: {
          select: {
            id: true,
            isActive: true,
            restaurant: { select: { id: true, tenantId: true, isActive: true } },
          },
        },
      },
    });

    if (!device || !device.isActive) {
      return res.status(401).json({ error: 'Dispositivo no autorizado' });
    }
    // Antes de que /create validara la sucursal, un Device podía quedar con el
    // tenant de quien lo vinculó y la sucursal de otro comercio: no se canjea.
    if (device.tenantId !== device.location?.restaurant?.tenantId) {
      return res.status(403).json({
        error: 'Dispositivo vinculado a una sucursal de otro negocio. Vuelve a vincularlo.',
        code: 'DEVICE_TENANT_MISMATCH',
      });
    }
    if (!device.location?.isActive || !device.location.restaurant?.isActive) {
      return res.status(403).json({ error: 'Sucursal o restaurante desactivado' });
    }

    // Mapear tipo de dispositivo a rol funcional para el JWT. El kiosko queda
    // al público: su rol propio no entra en ningún requireRole ni cuenta como
    // personal en /api/store (solo lo usa para acreditar `source: 'KIOSK'`).
    const roleByType = {
      KDS:   'KITCHEN',
      POS:   'CASHIER',
      WAITER: 'WAITER',
      KIOSK: 'KIOSK',
    };
    const role = roleByType[device.type] || 'CASHIER';

    const accessToken = jwt.sign(
      {
        userId: device.id,        // identificamos el "actor" como el device
        deviceId: device.id,
        isDevice: true,
        role,
        restaurantId: device.location.restaurant.id,
        locationId:   device.location.id,
        tenantId:     device.location.restaurant.tenantId,
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Actualizar lastPingAt como heartbeat de provisionamiento.
    prisma.device.update({
      where: { id: device.id },
      data:  { lastPingAt: new Date() },
    }).catch(() => { /* no bloquear */ });

    res.json({
      accessToken,
      deviceId: device.id,
      name: device.name,
      role,
      restaurantId: device.location.restaurant.id,
      locationId:   device.location.id,
    });
  } catch (e) {
    console.error('Error en /api/devices/auth:', e);
    res.status(500).json({ error: 'Error al autenticar dispositivo' });
  }
});

// POST /api/devices/create — Vincular un nuevo dispositivo (Hardware Provisioning)
// Build cache buster: forzar Railway a re-snapshot este archivo tras a450769.
//
// La sucursal manda: el Device queda en el tenant del restaurante dueño de la
// sucursal, y /auth firma su JWT con ese restaurante. Por eso la sucursal debe
// ser de un restaurante del mismo tenant que quien vincula (SUPER_ADMIN puede
// cruzar, como en requireTenantAccess), y ambos deben estar activos. El
// `restaurantId` del body ya no se usa: el restaurante sale de la sucursal.
router.post('/create', authenticate, requireTenantAccess, async (req, res) => {
  try {
    // Un Device no da de alta otros: con el JWT de un KDS o un kiosko se podría
    // fabricar un Device de caja y canjearlo en /auth por un JWT de rol CASHIER.
    if (req.user?.isDevice) {
      return res.status(403).json({ error: 'Un dispositivo no puede vincular otros dispositivos' });
    }
    // Solo vincula una cuenta ADMIN o SUPER_ADMIN, como piden los setups de TPV,
    // KDS, Tokki y kiosko (login con correo). Un cliente de la tienda (CUSTOMER,
    // con el tenant del comercio) o un empleado podían dar de alta un Device de
    // caja y canjearlo en /auth por un JWT de rol CASHIER.
    if (req.user?.isEmployee || !['ADMIN', 'SUPER_ADMIN'].includes(req.user?.role)) {
      return res.status(403).json({
        error: 'Solo un administrador puede vincular dispositivos',
        code: 'DEVICE_LINK_FORBIDDEN',
      });
    }

    const { locationId: bodyLocationId, deviceType } = req.body || {};
    const locationId = req.locationId || bodyLocationId;

    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada (locationId faltante)' });
    if (!deviceType) return res.status(400).json({ error: 'Tipo de dispositivo no proporcionado' });

    // Bypass del guard: el contexto del request es el restaurante del header o
    // del JWT, y la sucursal puede ser de otro restaurante del tenant (o de otro
    // tenant, para SUPER_ADMIN). La autorización es la comparación de abajo.
    const location = await runWithBypass(() => prisma.location.findUnique({
      where: { id: locationId },
      select: {
        id: true,
        isActive: true,
        restaurant: { select: { id: true, tenantId: true, isActive: true } },
      },
    }));
    if (!location?.restaurant) {
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    }

    const tenantId = location.restaurant.tenantId;
    const restaurantId = location.restaurant.id;
    if (req.user.role !== 'SUPER_ADMIN' && tenantId !== req.user.tenantId) {
      return res.status(403).json({ error: 'La sucursal no pertenece a tu negocio' });
    }
    if (!location.isActive || !location.restaurant.isActive) {
      return res.status(403).json({ error: 'Sucursal o restaurante desactivado' });
    }

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
        locationId: location.id,
        type: deviceType,
        name: `${deviceType} - ${new Date().toISOString().split('T')[0]}`,
        deviceToken,
        isActive: true
      }
    });

    res.json({
      deviceId: device.id,
      deviceToken,
      name: device.name,
    });

  } catch (e) {
    console.error('Error en /api/devices/create:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/devices/identity — Lookup ligero del nombre actual del device.
//
// La tablet llama esto desde la pantalla de bloqueo para mostrar la
// identidad real del terminal ("Comandera 1") aunque el admin la haya
// renombrado después de la vinculación. Usa deviceToken en el body
// porque el lock screen aún no tiene JWT humano.
router.post('/identity', async (req, res) => {
  try {
    const { deviceToken } = req.body || {};
    if (!deviceToken || typeof deviceToken !== 'string') {
      return res.status(400).json({ error: 'deviceToken requerido' });
    }
    const device = await prisma.device.findUnique({
      where: { deviceToken },
      select: { id: true, name: true, type: true, isActive: true },
    });
    if (!device || !device.isActive) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }
    res.json({ id: device.id, name: device.name, type: device.type });
  } catch (e) {
    console.error('Error en /api/devices/identity:', e);
    res.status(500).json({ error: 'Error al consultar identidad' });
  }
});

module.exports = router;
