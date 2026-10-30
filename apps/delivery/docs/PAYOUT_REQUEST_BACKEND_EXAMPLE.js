/**
 * Ejemplo de implementación: Endpoint de solicitud de retiro para repartidores
 *
 * UBICACIÓN SUGERIDA: apps/backend/src/routes/marketplace.routes.js
 *
 * Este código es una referencia de cómo integrar el endpoint de payout-request
 * en la ruta existente de marketplace. Adaptarlo según la arquitectura actual.
 */

'use strict';

function createPayoutRouter({ Router, authenticate, getPrisma = () => require('@mrtpvrest/database').prisma } = {}) {
  const router = (Router || require('express').Router)();

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/marketplace/drivers/:id/payout-request
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/drivers/:id/payout-request', authenticate, async (req, res) => {
    res.set('Cache-Control', 'no-store');

    try {
      const driverId = req.params.id;
      const { amount, bankAccount, accountType } = req.body;
      const prisma = getPrisma();

      // 1. Validación de entrada
      if (!Number.isFinite(amount) || amount <= 0 || amount < 100 || amount > 50000) {
        return res.status(400).json({
          error: 'Monto debe estar entre $100 y $50,000',
          errorCode: 'INVALID_AMOUNT'
        });
      }

      if (!accountType || !['CLABE', 'DEBIT'].includes(accountType)) {
        return res.status(400).json({
          error: 'Tipo de cuenta debe ser CLABE o DEBIT',
          errorCode: 'INVALID_ACCOUNT_TYPE'
        });
      }

      if (accountType === 'CLABE') {
        const clabeDigits = String(bankAccount || '').replace(/\D/g, '');
        if (clabeDigits.length !== 18) {
          return res.status(400).json({
            error: 'CLABE debe tener exactamente 18 dígitos',
            errorCode: 'INVALID_CLABE'
          });
        }
      } else if (accountType === 'DEBIT') {
        if (!bankAccount || String(bankAccount).trim().length === 0) {
          return res.status(400).json({
            error: 'Número de débito es requerido',
            errorCode: 'INVALID_DEBIT'
          });
        }
      }

      // 2. Verificar que el driver existe y pertenece al restaurante
      const driver = await prisma.driver.findUnique({
        where: { id: driverId },
        select: { id: true, restaurantId: true, name: true, email: true }
      });

      if (!driver) {
        return res.status(404).json({
          error: 'Repartidor no encontrado',
          errorCode: 'DRIVER_NOT_FOUND'
        });
      }

      // Verificar que el driver pertenece al restaurante actual (multi-tenancy)
      if (driver.restaurantId !== req.user?.restaurantId) {
        return res.status(403).json({
          error: 'No tienes permiso para este repartidor',
          errorCode: 'FORBIDDEN'
        });
      }

      // 3. Obtener balance disponible del repartidor
      // Esto puede variar según tu implementación actual de balance
      const balance = await getDriverAvailableBalance(driverId, prisma);

      if (amount > balance) {
        return res.status(400).json({
          error: `Monto excede saldo disponible ($${balance.toFixed(2)})`,
          errorCode: 'INSUFFICIENT_BALANCE'
        });
      }

      // 4. Verificar si hay efectivo pendiente en caja
      const cashInHand = await getDriverPendingCash(driverId, prisma);

      if (cashInHand > 0) {
        return res.status(400).json({
          error: 'Debe liquidar efectivo en caja antes de solicitar retiro',
          errorCode: 'CASH_IN_HAND_PENDING'
        });
      }

      // 5. Rate limiting: máximo 1 solicitud cada 5 minutos
      const recentRequest = await prisma.driverPayoutRequest.findFirst({
        where: {
          driverId,
          createdAt: {
            gte: new Date(Date.now() - 5 * 60 * 1000) // últimos 5 minutos
          }
        }
      });

      if (recentRequest) {
        return res.status(429).json({
          error: 'Espera 5 minutos antes de hacer otra solicitud',
          errorCode: 'RATE_LIMIT_EXCEEDED'
        });
      }

      // 6. Crear solicitud de retiro
      const normalizedClabe = accountType === 'CLABE'
        ? String(bankAccount).replace(/\D/g, '')
        : bankAccount;

      const payout = await prisma.driverPayoutRequest.create({
        data: {
          id: `payout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          driverId,
          amount,
          bankAccount: normalizedClabe,
          accountType,
          status: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      // 7. Notificaciones (opcionales)
      // - Notificar al repartidor
      // - Crear evento socket para actualización en tiempo real
      // - Enviar webhook a admin si está configurado

      return res.status(201).json({
        data: {
          id: payout.id,
          driverId: payout.driverId,
          amount: payout.amount,
          bankAccount: payout.bankAccount,
          accountType: payout.accountType,
          status: payout.status,
          createdAt: payout.createdAt.toISOString(),
          updatedAt: payout.updatedAt.toISOString()
        },
        message: 'Solicitud de retiro creada exitosamente'
      });

    } catch (error) {
      console.error('Error en payout-request:', error);
      return res.status(503).json({
        error: 'Solicitud de retiro temporalmente no disponible',
        errorCode: 'PAYOUT_UNAVAILABLE'
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/marketplace/drivers/:id/payouts
  // Lista historial de solicitudes de retiro del repartidor
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/drivers/:id/payouts', authenticate, async (req, res) => {
    res.set('Cache-Control', 'no-store');

    try {
      const driverId = req.params.id;
      const prisma = getPrisma();

      // Verificar que el driver pertenece al restaurante actual
      const driver = await prisma.driver.findUnique({
        where: { id: driverId },
        select: { restaurantId: true }
      });

      if (!driver || driver.restaurantId !== req.user?.restaurantId) {
        return res.status(404).json({
          error: 'Repartidor no encontrado',
          errorCode: 'DRIVER_NOT_FOUND'
        });
      }

      const payouts = await prisma.driverPayoutRequest.findMany({
        where: { driverId },
        orderBy: { createdAt: 'desc' },
        take: 100
      });

      return res.json({
        data: payouts.map(p => ({
          id: p.id,
          amount: p.amount,
          bankAccount: p.bankAccount,
          accountType: p.accountType,
          status: p.status,
          rejectionReason: p.rejectionReason,
          transferredAt: p.transferredAt?.toISOString() || null,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString()
        }))
      });

    } catch (error) {
      console.error('Error al obtener historial de payouts:', error);
      return res.status(503).json({
        error: 'Historial temporalmente no disponible',
        errorCode: 'PAYOUT_HISTORY_UNAVAILABLE'
      });
    }
  });

  return router;
}

// ─────────────────────────────────────────────────────────────────────────
// Helper functions - Adaptadas a tu implementación actual
// ─────────────────────────────────────────────────────────────────────────

/**
 * Obtiene el saldo disponible del repartidor (sin efectivo pendiente)
 * Adaptar según tu esquema actual de balance
 */
async function getDriverAvailableBalance(driverId, prisma) {
  // Implementación de ejemplo - ajustar a tu lógica actual
  const { getDriverBalance } = require('../lib/marketplace-driver-balance');

  try {
    const balance = await getDriverBalance({
      driverId,
      restaurantId: null, // si es necesario
      prismaClient: prisma
    });
    return balance.availableBalance || 0;
  } catch (err) {
    console.error('Error getting driver balance:', err);
    return 0;
  }
}

/**
 * Obtiene el efectivo pendiente en caja del repartidor
 */
async function getDriverPendingCash(driverId, prisma) {
  // Implementación de ejemplo - ajustar a tu lógica actual
  // Buscar movimientos de tipo INCOME sin cerrar
  const pendingCash = await prisma.driverCashMovement.aggregate({
    where: {
      driverId,
      type: 'INCOME',
      status: 'PENDING' // o similar
    },
    _sum: { amount: true }
  });

  return pendingCash._sum?.amount || 0;
}

module.exports = { createPayoutRouter };
