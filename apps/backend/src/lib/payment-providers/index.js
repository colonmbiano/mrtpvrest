// lib/payment-providers/index.js — Registro + resolver de pasarelas de pago
const { prisma } = require('@mrtpvrest/database')
const { MercadoPagoProvider } = require('./mercadopago')
const { StripeProvider }      = require('./stripe')

const REGISTRY = {
  MERCADOPAGO: MercadoPagoProvider,
  STRIPE:      StripeProvider,
}

/** Lista de keys soportados (para UI o validaciones) */
const SUPPORTED_KEYS = Object.keys(REGISTRY)

/**
 * Devuelve una instancia del provider a partir de una IntegrationConfig fila.
 * @param {object} integration - { type, config(JSON string), mode }
 */
function instantiateFromIntegration(integration) {
  if (!integration) return null
  const Cls = REGISTRY[integration.type]
  if (!Cls) return null

  let config = {}
  try {
    config = typeof integration.config === 'string'
      ? JSON.parse(integration.config)
      : (integration.config || {})
  } catch (_) { /* ignore */ }

  return new Cls({ config, mode: integration.mode || 'sandbox' })
}

/**
 * Resuelve el provider de pago activo para un restaurante.
 * Si hay varios habilitados, prioriza el indicado por preferredKey, o el primero
 * en el orden del registry.
 *
 * @param {string} restaurantId
 * @param {string} [preferredKey] - p.ej. 'MERCADOPAGO'
 * @returns {Promise<{ provider, key } | null>}
 */
async function resolveProviderForRestaurant(restaurantId, preferredKey = null) {
  const integrations = await prisma.integrationConfig.findMany({
    where: {
      restaurantId,
      enabled: true,
      type: { in: SUPPORTED_KEYS },
    },
  })
  if (!integrations.length) return null

  const chosen = preferredKey
    ? integrations.find(i => i.type === preferredKey)
    : SUPPORTED_KEYS.map(k => integrations.find(i => i.type === k)).find(Boolean)

  if (!chosen) return null
  const provider = instantiateFromIntegration(chosen)
  return provider ? { provider, key: chosen.type } : null
}

/**
 * Obtiene una instancia específica (para webhooks donde ya conocemos la pasarela).
 */
async function getProviderForRestaurant(restaurantId, providerKey) {
  const integration = await prisma.integrationConfig.findUnique({
    where: { restaurantId_type: { restaurantId, type: providerKey } },
  })
  if (!integration || !integration.enabled) return null
  return instantiateFromIntegration(integration)
}

module.exports = {
  REGISTRY,
  SUPPORTED_KEYS,
  resolveProviderForRestaurant,
  getProviderForRestaurant,
  instantiateFromIntegration,
}
