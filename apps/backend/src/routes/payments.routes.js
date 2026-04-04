const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const router = express.Router();

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
