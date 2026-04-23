// lib/payment-providers/mercadopago.js
const { PaymentProvider } = require('./base')
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago')

function normalizeStatus(raw) {
  if (raw === 'approved')                      return 'PAID'
  if (raw === 'rejected' || raw === 'cancelled') return 'FAILED'
  if (raw === 'refunded' || raw === 'charged_back') return 'REFUNDED'
  return 'PENDING'
}

class MercadoPagoProvider extends PaymentProvider {
  static get key()    { return 'MERCADOPAGO' }
  static get label()  { return 'MercadoPago' }
  static get fields() { return ['accessToken', 'publicKey', 'webhookSecret'] }

  constructor(opts) {
    super(opts)
    if (!this.config?.accessToken) throw new Error('MercadoPago: falta accessToken')
    this.client = new MercadoPagoConfig({ accessToken: this.config.accessToken })
  }

  async createCheckout({ order, items, backUrl, notificationUrl, currency = 'MXN' }) {
    const preference = new Preference(this.client)
    const prefData = await preference.create({
      body: {
        external_reference: order.id,
        items: items.map(it => ({
          id:          it.id,
          title:       it.title,
          quantity:    it.quantity,
          unit_price:  it.unitPrice,
          currency_id: currency,
        })),
        back_urls: {
          success: `${backUrl}?status=success&orderId=${order.id}`,
          failure: `${backUrl}?status=failure&orderId=${order.id}`,
          pending: `${backUrl}?status=pending&orderId=${order.id}`,
        },
        auto_return:          'approved',
        notification_url:     notificationUrl,
        statement_descriptor: 'KIOSKO',
      },
    })

    return {
      checkoutUrl: prefData.init_point,
      providerRef: prefData.id,
    }
  }

  async getPayment(paymentId) {
    const paymentClient = new Payment(this.client)
    const payment = await paymentClient.get({ id: paymentId })
    return {
      status:            normalizeStatus(payment.status),
      rawStatus:         payment.status,
      externalReference: payment.external_reference,
      providerId:        String(payment.id),
    }
  }
}

module.exports = { MercadoPagoProvider }
