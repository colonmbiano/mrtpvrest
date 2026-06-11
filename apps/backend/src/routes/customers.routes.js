// Directorio de clientes por teléfono. Lo consume el TPV para autocompletar
// nombre/dirección al meter un pedido (búsqueda por teléfono normalizado).
// Multi-tenant: siempre acotado al restaurantId del request.
const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { normalizePhone } = require('@mrtpvrest/config/phone');
const { authenticate, requireTenantAccess, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();

// ── GET /by-phone?phone=... — Buscar cliente por teléfono ──────────────
// Devuelve { found, customer } donde customer trae los datos para
// autocompletar. 200 con found:false si no existe (no es un error).
router.get(
  '/by-phone',
  authenticate,
  requireTenantAccess,
  requireRole('CASHIER', 'WAITER', 'MANAGER', 'ADMIN', 'OWNER', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const restaurantId = req.user?.restaurantId || req.restaurantId;
      if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

      const phone = normalizePhone(req.query.phone);
      // Pedimos mínimo 7 dígitos para no disparar búsquedas con números a medias.
      if (!phone || phone.length < 7) return res.json({ found: false });

      const customer = await prisma.customer.findUnique({
        where: { restaurantId_phone: { restaurantId, phone } },
        select: {
          name: true,
          phone: true,
          address: true,
          ordersCount: true,
          totalSpent: true,
          lastOrderAt: true,
        },
      });

      if (!customer) return res.json({ found: false });
      return res.json({ found: true, customer });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
);

module.exports = router;
