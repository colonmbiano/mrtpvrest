// lib/payment-providers/base.js — Interfaz común para pasarelas de pago
//
// Cada provider concreto (mercadopago.js, stripe.js, etc.) debe implementar
// createCheckout() + getPayment() y devolver resultados normalizados.
//
// Estados normalizados: PAID | PENDING | FAILED | REFUNDED

class PaymentProvider {
  static get key() { return 'BASE' }
  static get label() { return 'Base' }
  static get fields() { return [] }  // nombres de campos que pide el admin

  constructor({ config = {}, mode = 'sandbox' } = {}) {
    this.config = config
    this.mode   = mode
  }

  /**
   * Crea un checkout/preferencia de pago.
   * @param {object} ctx
   * @param {object} ctx.order           - orden con id, total, orderNumber
   * @param {Array}  ctx.items           - [{ id, title, quantity, unitPrice }]
   * @param {string} ctx.backUrl         - URL de retorno del usuario
   * @param {string} ctx.notificationUrl - URL del webhook
   * @param {string} ctx.currency        - ISO 4217, default 'MXN'
   * @returns {Promise<{ checkoutUrl: string, providerRef: string }>}
   */
  async createCheckout(_ctx) {
    throw new Error('createCheckout() no implementado')
  }

  /**
   * Consulta un pago por id.
   * @param {string} paymentId
   * @returns {Promise<{ status: 'PAID'|'PENDING'|'FAILED'|'REFUNDED', rawStatus: string, externalReference: string, providerId: string }>}
   */
  async getPayment(_paymentId) {
    throw new Error('getPayment() no implementado')
  }
}

module.exports = { PaymentProvider }
