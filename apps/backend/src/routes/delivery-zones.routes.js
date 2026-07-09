// delivery-zones.routes.js — Zonas de entrega por polígono.
//
// Endpoints (todos admin + scoped al restaurante del token):
//   GET    /            → zonas del restaurante (para el editor de mapa)
//   POST   /            → crear o actualizar una zona (id presente = update)
//   DELETE /:id         → eliminar una zona
//
// El polígono es un array de vértices { lat, lng }. La tarifa (fee) se cobra
// cuando la coordenada del cliente cae dentro; la lógica de punto-en-polígono
// vive en lib/delivery-fee.js (fuente única para tienda web y bot).

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const { pick } = require('../lib/validate');
const router = express.Router();

function rid(req) {
  return req.user?.restaurantId || req.restaurantId || null;
}

// Valida y normaliza el polígono: array de >=3 vértices { lat, lng } numéricos
// y en rango. Devuelve el array saneado o null si es inválido.
function sanitizePolygon(raw) {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const clean = [];
  for (const v of raw) {
    const lat = Number(v?.lat);
    const lng = Number(v?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    clean.push({ lat, lng });
  }
  return clean;
}

function serialize(zone) {
  return {
    id: zone.id,
    name: zone.name,
    fee: Number(zone.fee) || 0,
    color: zone.color,
    polygon: zone.polygon,
    active: zone.active,
    priority: zone.priority,
  };
}

// ── Listado ──────────────────────────────────────────────────────────────────
router.get('/', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = rid(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const zones = await prisma.deliveryZone.findMany({
      where: { restaurantId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    res.json({ zones: zones.map(serialize) });
  } catch (e) {
    console.error('[delivery-zones] list:', e.message);
    res.status(500).json({ error: 'Error al obtener las zonas' });
  }
});

// ── Crear / actualizar ───────────────────────────────────────────────────────
router.post('/', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = rid(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const body = pick(req.body, ['id', 'name', 'fee', 'color', 'polygon', 'active', 'priority']);

    const name = String(body.name || '').trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: 'Ponle un nombre a la zona' });

    const polygon = sanitizePolygon(body.polygon);
    if (!polygon) return res.status(400).json({ error: 'Dibuja la zona con al menos 3 puntos en el mapa' });

    // Color hex #rgb / #rrggbb; si no cumple, usamos el verde por defecto.
    const color = /^#[0-9a-fA-F]{3,8}$/.test(String(body.color || '')) ? String(body.color) : '#22c55e';

    const data = {
      name,
      fee: Math.max(0, Number(body.fee) || 0),
      color,
      polygon,
      active: body.active !== false,
      priority: Number.isFinite(Number(body.priority)) ? Math.trunc(Number(body.priority)) : 0,
    };

    let zone;
    if (body.id) {
      const updated = await prisma.deliveryZone.updateMany({
        where: { id: String(body.id), restaurantId },
        data,
      });
      if (updated.count === 0) return res.status(404).json({ error: 'Zona no encontrada' });
      zone = await prisma.deliveryZone.findFirst({ where: { id: String(body.id), restaurantId } });
    } else {
      zone = await prisma.deliveryZone.create({ data: { restaurantId, ...data } });
    }

    res.json({ ok: true, zone: serialize(zone) });
  } catch (e) {
    console.error('[delivery-zones] save:', e.message);
    res.status(500).json({ error: 'Error al guardar la zona' });
  }
});

// ── Eliminar ─────────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = rid(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const deleted = await prisma.deliveryZone.deleteMany({
      where: { id: req.params.id, restaurantId },
    });
    if (deleted.count === 0) return res.status(404).json({ error: 'Zona no encontrada' });

    res.json({ ok: true });
  } catch (e) {
    console.error('[delivery-zones] delete:', e.message);
    res.status(500).json({ error: 'Error al eliminar la zona' });
  }
});

module.exports = router;
