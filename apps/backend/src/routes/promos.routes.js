require('dotenv').config();
const express = require('express');
const cloudinary = require('cloudinary').v2;
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');

const router = express.Router();

// Cloudinary — reutiliza credenciales del entorno. El cloud name por defecto
// es el del proyecto (dqvgidive) si no viene en el entorno.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dqvgidive',
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Resuelve el tenantId real del request. El modelo Promo referencia a `Tenant`,
// no a `Restaurant`, por eso resolvemos el tenant (no el restaurantId). El
// middleware de tenant corre antes que el JWT, así que probamos varias fuentes.
function getTenantId(req) {
  return (
    req.user?.tenantId ||
    req.tenant?.tenant?.id ||
    req.restaurant?.tenantId ||
    null
  );
}

// ── GET /api/promos ─────────────────────────────────────────────────────────
// Consumo del TPV: solo promos activas del tenant, ordenadas.
router.get('/', authenticate, requireTenantAccess, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'Tenant no identificado' });

    const promos = await prisma.promo.findMany({
      where: { tenantId, active: true },
      orderBy: { order: 'asc' },
    });
    res.json(promos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/promos/all ─────────────────────────────────────────────────────
// Admin: todas las promos (incluye inactivas).
router.get('/all', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'Tenant no identificado' });

    const promos = await prisma.promo.findMany({
      where: { tenantId },
      orderBy: { order: 'asc' },
    });
    res.json(promos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/promos/reorder ─────────────────────────────────────────────────
// IMPORTANTE: definir ANTES de las rutas con `:id` para evitar colisión de
// patrón (Express probaría `/:id` con id="reorder").
router.put('/reorder', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'Tenant no identificado' });

    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
    if (!ids) return res.status(400).json({ error: 'ids requerido (array)' });

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.promo.updateMany({
          where: { id, tenantId },
          data: { order: index },
        })
      )
    );

    const promos = await prisma.promo.findMany({
      where: { tenantId },
      orderBy: { order: 'asc' },
    });
    res.json(promos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/promos ────────────────────────────────────────────────────────
// body: { imageBase64? | imageUrl?, title?, subtitle?, order? }
router.post('/', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'Tenant no identificado' });

    const { imageBase64, imageUrl, title, subtitle, order } = req.body || {};

    let finalImageUrl = imageUrl || null;

    if (imageBase64) {
      // imageBase64 puede venir como data URI completo o solo el base64.
      const dataUri = imageBase64.startsWith('data:')
        ? imageBase64
        : `data:image/jpeg;base64,${imageBase64}`;

      const uploaded = await cloudinary.uploader.upload(dataUri, {
        folder: `mrtpvrest/promos/${tenantId}`,
        transformation: [
          { width: 1920, crop: 'limit', quality: 'auto', fetch_format: 'auto' },
        ],
      });
      finalImageUrl = uploaded.secure_url;
    }

    if (!finalImageUrl) {
      return res.status(400).json({ error: 'Se requiere imageBase64 o imageUrl' });
    }

    const count = await prisma.promo.count({ where: { tenantId } });

    const promo = await prisma.promo.create({
      data: {
        tenantId,
        imageUrl: finalImageUrl,
        title: title ?? null,
        subtitle: subtitle ?? null,
        order: Number.isInteger(order) ? order : count,
      },
    });
    res.json(promo);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/promos/:id ───────────────────────────────────────────────────
// Actualiza solo los campos presentes (title/subtitle/order/active).
router.patch('/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'Tenant no identificado' });

    const existing = await prisma.promo.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!existing) return res.status(404).json({ error: 'Promo no encontrada' });

    const data = {};
    const body = req.body || {};
    if (Object.prototype.hasOwnProperty.call(body, 'title')) data.title = body.title;
    if (Object.prototype.hasOwnProperty.call(body, 'subtitle')) data.subtitle = body.subtitle;
    if (Object.prototype.hasOwnProperty.call(body, 'order')) data.order = body.order;
    if (Object.prototype.hasOwnProperty.call(body, 'active')) data.active = body.active;

    const promo = await prisma.promo.update({
      where: { id: req.params.id },
      data,
    });
    res.json(promo);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/promos/:id ──────────────────────────────────────────────────
router.delete('/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'Tenant no identificado' });

    const existing = await prisma.promo.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!existing) return res.status(404).json({ error: 'Promo no encontrada' });

    await prisma.promo.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
