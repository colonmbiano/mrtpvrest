// Zod schema para PUT /api/integrations/:type
// Validación genérica del envelope; cada provider valida su propio
// `config` adentro del handler (Stripe, MercadoPago, etc.).

const { z } = require('zod');

const upsertIntegrationSchema = z.object({
  enabled: z.boolean().optional(),
  mode:    z.enum(['live', 'test', 'sandbox']).optional(),
  // config es objeto libre — provider-specific. Si llega null/undefined se
  // toma como "limpiar". Se rechaza si es array o primitivo (que romperían
  // el provider downstream).
  config:  z.record(z.string(), z.any()).optional().nullable(),
}).passthrough();

module.exports = { upsertIntegrationSchema };
