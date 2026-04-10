const express = require('express');
const crypto  = require('crypto');
const { prisma } = require('@mrtpvrest/database');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const router = express.Router();

/**
 * Verifica la firma HMAC-SHA256 del webhook de MercadoPago.
 * Header formato: x-signature: ts=<timestamp>,v1=<hash>
 * Cadena firmada:  id:<paymentId>;request-id:<x-request-id>;ts:<timestamp>
 */
function verifyMPSignature(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true; // Si no hay secret configurado, saltar verificación (dev)

  const xSignature  = req.headers['x-signature']  || '';
  const xRequestId  = req.headers['x-request-id'] || '';
  const paymentId   = req.query?.['data.id'] || req.body?.data?.id || '';

  const tsMatch = xSignature.match(/ts=(\d+)/);
  const v1Match = xSignature.match(/v1=([a-f0-9]+)/);
  if (!tsMatch || !v1Match) return false;

  const ts       = tsMatch[1];
  const received = v1Match[1];
  const manifest = `id:${paymentId};request-id:${xRequestId};ts:${ts}`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received.padEnd(expected.length, '0').slice(0, expected.length), 'hex'));
}

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// POST /api/payments/create — Crear preferencia de pago
router.post('/create', async (req, res) => {
  try {
    const { orderId, items, total, customerEmail, customerName } = req.body;

    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: items.map((i) => ({
          id: i.menuItemId,
          title: i.name,
          quantity: i.quantity,
          unit_price: Number(i.unitPrice || i.price),
          currency_id: 'MXN',
        })),
        payer: {
          email: customerEmail || 'cliente@masterburgers.com',
          name: customerName || 'Cliente',
        },
        payment_methods: {
          excluded_payment_types: [],
          installments: 1,
        },
        back_urls: {
          success: `${process.env.FRONTEND_URL || 'http://localhost:3002'}/pedido/${orderId}?payment=success`,
          failure: `${process.env.FRONTEND_URL || 'http://localhost:3002'}/pedido/${orderId}?payment=failure`,
          pending: `${process.env.FRONTEND_URL || 'http://localhost:3002'}/pedido/${orderId}?payment=pending`,
        },
        ...(process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost') ? { auto_return: 'approved' } : {}),
        external_reference: orderId,
        notification_url: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/payments/webhook`,
        statement_descriptor: "Master Burger's",
      }
    });

    // Guardar preferenceId en la orden
    await prisma.order.update({
      where: { id: orderId },
      data: { paymentMethod: 'CARD' }
    });

    res.json({
      preferenceId: result.id,
      initPoint: result.init_point,
      sandboxInitPoint: result.sandbox_init_point,
    });
  } catch (e) {
    console.error('MP Error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/payments/webhook — Notificación de MercadoPago
router.post('/webhook', async (req, res) => {
  // Verificar firma antes de procesar cualquier cosa
  if (!verifyMPSignature(req)) {
    console.warn('[webhook] Firma inválida — posible request falsificado');
    return res.sendStatus(400);
  }

  try {
    const { type, data } = req.body;
    if (type !== 'payment') { res.sendStatus(200); return; }

    const payment = new Payment(client);
    const paymentData = await payment.get({ id: data.id });

    const orderId = paymentData.external_reference;
    const status  = paymentData.status; // approved, rejected, pending

    if (!orderId) { res.sendStatus(200); return; }

    if (status === 'approved') {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'CONFIRMED',
          paidAt: new Date(),
          paymentMethod: paymentData.payment_type_id === 'ticket' ? 'OXXO' :
                         paymentData.payment_type_id === 'bank_transfer' ? 'SPEI' : 'CARD',
        }
      });
      console.log('✅ Pago aprobado para orden:', orderId);
    } else if (status === 'rejected') {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' }
      });
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('Webhook error:', e);
    res.sendStatus(200); // Siempre responder 200 a MP
  }
});

// GET /api/payments/status/:orderId — Verificar estado del pago
router.get('/status/:orderId', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      select: { id: true, status: true, paidAt: true, paymentMethod: true, orderNumber: true }
    });
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
