const express = require('express');
const crypto  = require('crypto');
const { prisma } = require('@mrtpvrest/database');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const router = express.Router();

function verifyMPSignature(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';

  const xSignature = req.headers['x-signature'] || '';
  const xRequestId = req.headers['x-request-id'] || '';
  const paymentId = req.query?.['data.id'] || req.body?.data?.id || '';

  const tsMatch = xSignature.match(/ts=(\d+)/);
  const v1Match = xSignature.match(/v1=([a-f0-9]+)/);
  if (!tsMatch || !v1Match) return false;

  const ts = tsMatch[1];
  const received = v1Match[1];
  const manifest = `id:${paymentId};request-id:${xRequestId};ts:${ts}`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(received.padEnd(expected.length, '0').slice(0, expected.length), 'hex')
  );
}

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// POST /api/payments/create - Crear preferencia de pago para una orden existente.
router.post('/create', async (req, res) => {
  try {
    const { orderId, customerEmail, customerName } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId requerido' });

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    if (order.paymentStatus !== 'PENDING') {
      return res.status(409).json({ error: 'La orden ya no esta pendiente' });
    }
    if (!order.items.length) {
      return res.status(400).json({ error: 'La orden no tiene items' });
    }

    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: order.items.map((i) => ({
          id: i.menuItemId || i.id,
          title: i.name,
          quantity: i.quantity,
          unit_price: Number(i.price),
          currency_id: 'MXN',
        })),
        payer: {
          email: customerEmail || 'cliente@masterburgers.com',
          name: customerName || order.customerName || 'Cliente',
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
        statement_descriptor: "Restaurante Demo",
      },
    });

    await prisma.order.update({
      where: { id: orderId },
      data: { paymentMethod: 'CARD' },
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

router.post('/webhook', async (req, res) => {
  if (!verifyMPSignature(req)) {
    console.warn('[webhook] Firma invalida o secret faltante en produccion');
    return res.sendStatus(400);
  }

  try {
    const { type, data } = req.body;
    if (type !== 'payment') { res.sendStatus(200); return; }

    const payment = new Payment(client);
    const paymentData = await payment.get({ id: data.id });

    const orderId = paymentData.external_reference;
    const status = paymentData.status;

    if (!orderId) { res.sendStatus(200); return; }

    // MP entrega at-least-once y puede reordenar eventos: el WHERE condicional
    // hace los updates idempotentes y evita que un `rejected` tardío (p.ej. un
    // intento de pago fallido previo al que sí aprobó) cancele una orden pagada.
    if (status === 'approved') {
      const updated = await prisma.order.updateMany({
        where: { id: orderId, paymentStatus: { not: 'PAID' } },
        data: {
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          paidAt: new Date(),
          paymentMethod: paymentData.payment_type_id === 'ticket' ? 'OXXO' :
                         paymentData.payment_type_id === 'bank_transfer' ? 'SPEI' : 'CARD',
        },
      });
      if (updated.count > 0) console.log('Pago aprobado para orden:', orderId);
    } else if (status === 'rejected') {
      await prisma.order.updateMany({
        where: { id: orderId, paymentStatus: { not: 'PAID' }, status: { not: 'CANCELLED' } },
        data: { status: 'CANCELLED' },
      });
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('Webhook error:', e);
    res.sendStatus(200);
  }
});

router.get('/status/:orderId', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      select: { id: true, status: true, paidAt: true, paymentMethod: true, paymentStatus: true, orderNumber: true },
    });
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
