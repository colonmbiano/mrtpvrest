const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const crypto = require('crypto');
const router = express.Router();

const INTEGRATION_TYPES = {
  MERCADOPAGO: { label: 'MercadoPago', fields: ['accessToken', 'publicKey', 'webhookSecret'], icon: '💳' },
  STRIPE:      { label: 'Stripe',      fields: ['secretKey', 'publicKey', 'webhookSecret'], icon: '🌍' },
  WHATSAPP:    { label: 'WhatsApp API', fields: ['token', 'phoneNumberId', 'wabaId'], icon: '💬' },
  CLOUDINARY:  { label: 'Cloudinary (Fotos)', fields: ['cloudName', 'apiKey', 'apiSecret'], icon: '☁️' },
  RAPPI:       { label: 'Rappi Webhook', fields: ['apiKey', 'storeId'], icon: '🛵' },
};

// GET integraciones del restaurante actual
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const configs = await prisma.integrationConfig.findMany({
      where: { restaurantId: req.restaurantId }
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
router.put('/:type', authenticate, requireAdmin, async (req, res) => {
  try {
    const { enabled, mode, config } = req.body;
    const type = req.params.type.toUpperCase();

    if (!INTEGRATION_TYPES[type]) return res.status(400).json({ error: 'Tipo de integración no soportado' });

    const integration = await prisma.integrationConfig.upsert({
      where: {
        restaurantId_type: {
          restaurantId: req.restaurantId,
          type
        }
      },
      update: {
        enabled,
        mode: mode || 'sandbox',
        config: JSON.stringify(config)
      },
      create: {
        restaurantId: req.restaurantId,
        type,
        enabled: enabled || false,
        mode: mode || 'sandbox',
        config: JSON.stringify(config)
      }
    });

    res.json({ ok: true, message: `Configuración de ${type} actualizada` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
