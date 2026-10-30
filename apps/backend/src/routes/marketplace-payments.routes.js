'use strict';

/**
 * marketplace-payments.routes.js
 *
 * Rutas para la integración de pagos del marketplace:
 * - POST /checkout - Crear preferencia de pago con split automático
 * - POST /webhook - Recibir y procesar webhooks de Mercado Pago (idempotente)
 * - GET /merchants/:slug/oauth-url - Obtener URL de OAuth para onboarding
 * - GET /merchants/:slug/balance - Saldo de liquidación del comercio
 * - GET /platform/balance - Saldo global de la plataforma
 */

const {
  createPaymentPreference,
  generateOAuthUrl,
  handleOAuthCallback,
  validateWebhookSignature,
  processPaymentWebhook,
  processSettlementWebhook,
  getMerchantBalance,
  getPlatformBalance,
  PaymentError,
} = require('../lib/marketplace-payments');

const { createInMemoryLedgerStore } = require('../lib/marketplace-ledger');

function createMarketplacePaymentsRouter({ Router, ledger } = {}) {
  const router = (Router || require('express').Router)();

  // Usar ledger pasado o crear uno en memoria (para testing)
  const store = ledger || createInMemoryLedgerStore();

  /**
   * POST /api/marketplace/payments/checkout
   * Crear una preferencia de pago con split automático.
   *
   * Body:
   * {
   *   "orderId": "order_123",
   *   "subtotal": 100,
   *   "deliveryFee": 10,
   *   "tip": 5,
   *   "commissionRate": 0.05,
   *   "collectorId": "collector_...",
   *   "customerEmail": "client@example.com"
   * }
   */
  router.post('/checkout', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const {
        orderId,
        subtotal,
        deliveryFee = 0,
        tip = 0,
        commissionRate = 0.05,
        commissionFixed = 0,
        collectorId,
        customerEmail = 'customer@marketplace.local',
        description = '',
      } = req.body;

      if (!orderId || subtotal === undefined || !collectorId) {
        return res.status(400).json({
          error: 'Parametros incompletos',
          errorCode: 'MISSING_CHECKOUT_PARAMS',
          required: ['orderId', 'subtotal', 'collectorId'],
        });
      }

      const preference = createPaymentPreference({
        orderId,
        subtotal,
        deliveryFee,
        tip,
        commissionRate,
        commissionFixed,
        collectorId,
        customerEmail,
        description,
      });

      res.status(201).json(preference);
    } catch (error) {
      if (error instanceof PaymentError) {
        return res.status(400).json({
          error: error.message,
          errorCode: error.code,
          details: error.details,
        });
      }
      res.status(503).json({
        error: 'Error creando preferencia de pago',
        errorCode: 'CHECKOUT_ERROR',
      });
    }
  });

  /**
   * POST /api/marketplace/payments/webhook
   * Recibir webhooks de Mercado Pago (payment.created, payment.updated, merchant_order.updated).
   * Valida firma y aplica idempotencia via ledger.
   *
   * Headers:
   * - x-signature: Firma del webhook
   * - x-request-id: ID de la solicitud (para idempotencia)
   *
   * Body (simulado):
   * {
   *   "action": "payment.created" | "payment.updated" | "merchant_order.updated",
   *   "data": {
   *     "id": "payment_123",
   *     "external_reference": "order_123",
   *     "status": "approved",
   *     "transaction_amount": 115.00,
   *     ...
   *   }
   * }
   */
  router.post('/webhook', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const xSignature = req.headers['x-signature'];
      const xRequestId = req.headers['x-request-id'];
      const { action, data } = req.body;

      if (!xSignature || !xRequestId || !action || !data) {
        return res.status(400).json({
          error: 'Webhook incompleto',
          errorCode: 'INVALID_WEBHOOK_FORMAT',
        });
      }

      // Validar firma
      let signatureResult;
      try {
        signatureResult = validateWebhookSignature({
          xSignature,
          xRequestId,
          body: req.body,
        });
      } catch (sigError) {
        return res.status(401).json({
          error: sigError.message,
          errorCode: sigError.code,
        });
      }

      const { idempotencyKey } = signatureResult;

      // Procesar según el tipo de evento
      let result;
      if (action === 'payment.created' || action === 'payment.updated') {
        result = processPaymentWebhook({
          paymentId: data.id,
          externalReference: data.external_reference,
          status: data.status,
          amount: data.transaction_amount,
          metadata: data.metadata || {},
          ledger: store,
          idempotencyKey,
        });
      } else if (action === 'merchant_order.updated') {
        // Settlement: cuando la orden se marca como DELIVERED
        if (data.order_status === 'DELIVERED' && data.settlement) {
          result = processSettlementWebhook({
            orderId: data.external_reference,
            settlement: data.settlement,
            ledger: store,
            idempotencyKey,
          });
        } else {
          // Eventos de merchant_order que no son settlement, ignorar silenciosamente
          return res.status(200).json({ processed: false, reason: 'NOT_SETTLEMENT_EVENT' });
        }
      } else {
        return res.status(400).json({
          error: `Tipo de webhook desconocido: ${action}`,
          errorCode: 'UNKNOWN_WEBHOOK_ACTION',
        });
      }

      // Verificar integridad global del ledger
      const integrity = store.verifyGlobalIntegrity();
      if (!integrity.valid) {
        console.error('⚠️  LEDGER INTEGRITY CHECK FAILED', integrity);
        return res.status(500).json({
          error: 'Error de integridad contable',
          errorCode: 'LEDGER_INTEGRITY_ERROR',
          details: integrity,
        });
      }

      res.status(200).json({
        processed: true,
        result,
        ledgerIntegrity: integrity,
      });
    } catch (error) {
      if (error instanceof PaymentError) {
        return res.status(400).json({
          error: error.message,
          errorCode: error.code,
          details: error.details,
        });
      }
      console.error('Webhook processing error:', error);
      res.status(503).json({
        error: 'Error procesando webhook',
        errorCode: 'WEBHOOK_PROCESSING_ERROR',
      });
    }
  });

  /**
   * GET /api/marketplace/payments/merchants/:slug/oauth-url
   * Obtener URL de OAuth para onboarding del comercio.
   */
  router.get('/merchants/:slug/oauth-url', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const { slug } = req.params;
      const { tenantId } = req.query;

      if (!slug || !tenantId) {
        return res.status(400).json({
          error: 'Falta slug o tenantId',
          errorCode: 'MISSING_OAUTH_PARAMS',
        });
      }

      const { url, state } = generateOAuthUrl({
        tenantId,
        merchantSlug: slug,
      });

      res.status(200).json({
        oauthUrl: url,
        state,
        merchantSlug: slug,
        tenantId,
        expiresIn: 3600,
      });
    } catch (error) {
      if (error instanceof PaymentError) {
        return res.status(400).json({
          error: error.message,
          errorCode: error.code,
        });
      }
      res.status(503).json({
        error: 'Error generando URL de OAuth',
        errorCode: 'OAUTH_URL_ERROR',
      });
    }
  });

  /**
   * GET /api/marketplace/payments/merchants/:slug/balance
   * Obtener saldo de liquidación pendiente del comercio.
   */
  router.get('/merchants/:slug/balance', async (req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    try {
      const { slug } = req.params;
      const { collectorId } = req.query;

      if (!slug || !collectorId) {
        return res.status(400).json({
          error: 'Falta slug o collectorId',
          errorCode: 'MISSING_BALANCE_PARAMS',
        });
      }

      const balance = getMerchantBalance({
        ledger: store,
        collectorId,
      });

      res.status(200).json(balance);
    } catch (error) {
      if (error instanceof PaymentError) {
        return res.status(400).json({
          error: error.message,
          errorCode: error.code,
        });
      }
      res.status(503).json({
        error: 'Error obteniendo balance',
        errorCode: 'BALANCE_ERROR',
      });
    }
  });

  /**
   * GET /api/marketplace/payments/platform/balance
   * Obtener saldo global de la plataforma (comisiones, courier payable, etc).
   */
  router.get('/platform/balance', async (req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    try {
      const balance = getPlatformBalance({
        ledger: store,
      });

      res.status(200).json(balance);
    } catch (error) {
      if (error instanceof PaymentError) {
        return res.status(400).json({
          error: error.message,
          errorCode: error.code,
        });
      }
      res.status(503).json({
        error: 'Error obteniendo balance de plataforma',
        errorCode: 'PLATFORM_BALANCE_ERROR',
      });
    }
  });

  return router;
}

module.exports = createMarketplacePaymentsRouter;
