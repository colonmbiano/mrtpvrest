const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const { validateBody } = require('../lib/validate');
const { upsertIntegrationSchema } = require('../schemas/integrations.schema');
const crypto = require('crypto');
const router = express.Router();

const INTEGRATION_TYPES = {
  MERCADOPAGO: { label: 'Pago digital', fields: ['accessToken', 'publicKey', 'webhookSecret'], icon: '💳' },
  STRIPE:      { label: 'Tarjeta bancaria',      fields: ['secretKey', 'publicKey', 'webhookSecret'], icon: '🌍' },
  WHATSAPP:    { label: 'Mensajeria', fields: ['token', 'phoneNumberId', 'wabaId'], icon: '💬' },
  CLOUDINARY:  { label: 'Fotos', fields: ['cloudName', 'apiKey', 'apiSecret'], icon: '☁️' },
  RAPPI:       { label: 'Delivery webhook', fields: ['apiKey', 'storeId'], icon: '🛵' },
};

// GET integraciones del restaurante actual
router.get('/', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const configs = await prisma.integrationConfig.findMany({
      where: { restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId }
    });

    // Enmascarar credenciales sensibles antes de enviar al frontend
    const safeConfigs = configs.map(c => {
      let parsed = {};
      try { parsed = JSON.parse(c.config); } catch {}
      const masked = {};
      Object.keys(parsed).forEach(k => {
        const v = parsed[k];
        masked[k] = v && v.length > 8 ? v.substring(0,4) + '••••' + v.slice(-4) : v;
      });
      return { ...c, config: masked };
    });

    res.json({ integrations: safeConfigs, types: INTEGRATION_TYPES });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT guardar/actualizar integración (Por Restaurante)
router.put('/:type', authenticate, requireTenantAccess, requireAdmin, validateBody(upsertIntegrationSchema), async (req, res) => {
  try {
    const { enabled, mode, config } = req.body;
    const type = req.params.type.toUpperCase();

    if (!INTEGRATION_TYPES[type]) return res.status(400).json({ error: 'Tipo de integración no soportado' });

    const restaurantId = req.user?.restaurantId || req.user?.restaurantId || req.restaurantId;

    // El GET enmascara credenciales (ej. "APP_••••3914"). Si el frontend reenvía
    // ese valor enmascarado (o vacío) al guardar — p.ej. al solo activar el
    // toggle sin re-teclear el token — NO debemos sobreescribir el valor real.
    // Fusionamos con lo ya guardado conservando el secreto existente.
    const existing = await prisma.integrationConfig.findUnique({
      where: { restaurantId_type: { restaurantId, type } },
    });
    let prevConfig = {};
    try { prevConfig = existing?.config ? JSON.parse(existing.config) : {}; } catch {}

    const isMasked = (v) => typeof v === 'string' && v.includes('•');
    const mergedConfig = { ...prevConfig };
    Object.keys(config || {}).forEach((k) => {
      const v = config[k];
      if (v === '' || v === null || v === undefined || isMasked(v)) return; // conserva el previo
      mergedConfig[k] = v;
    });

    const integration = await prisma.integrationConfig.upsert({
      where: { restaurantId_type: { restaurantId, type } },
      update: {
        enabled,
        mode: mode || 'sandbox',
        config: JSON.stringify(mergedConfig)
      },
      create: {
        restaurantId,
        type,
        enabled: enabled || false,
        mode: mode || 'sandbox',
        config: JSON.stringify(mergedConfig)
      }
    });

    res.json({ ok: true, message: `Configuración de ${type} actualizada` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
