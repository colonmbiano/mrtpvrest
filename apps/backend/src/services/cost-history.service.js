// services/cost-history.service.js
// Registra cambios de costo de ingredientes en IngredientCostHistory.
// Usar SIEMPRE dentro de la misma transacción que el update del Ingredient
// para garantizar consistencia: si el update falla, la entry de history
// se revierte.

const VALID_REASONS = new Set([
  'manual_update',
  'supplier_invoice',
  'voice_agent',
  'bulk_import',
  'purchase_receipt',
])

/**
 * @param {import('@prisma/client').PrismaClient | any} prismaOrTx prisma o tx
 * @param {string} ingredientId
 * @param {{
 *   cost?: number,
 *   purchaseCost?: number | null,
 *   purchaseUnit?: string | null,
 *   conversionFactor?: number | null,
 * }} newData
 * @param {{ changedBy?: string | null, reason?: string }} [opts]
 * @returns {Promise<boolean>} true si se registró cambio, false si no hubo delta
 */
async function recordCostChange(prismaOrTx, ingredientId, newData, opts = {}) {
  if (!ingredientId) return false

  const current = await prismaOrTx.ingredient.findUnique({
    where: { id: ingredientId },
    select: {
      cost: true,
      purchaseCost: true,
      purchaseUnit: true,
      conversionFactor: true,
    },
  })
  if (!current) return false

  // ε para flotantes — evita registrar ruido por redondeo en cálculos
  const eps = 0.0001
  const next = {
    cost: newData.cost ?? current.cost,
    purchaseCost: newData.purchaseCost === undefined ? current.purchaseCost : newData.purchaseCost,
    purchaseUnit: newData.purchaseUnit === undefined ? current.purchaseUnit : newData.purchaseUnit,
    conversionFactor: newData.conversionFactor === undefined ? current.conversionFactor : newData.conversionFactor,
  }

  const costChanged = Math.abs((next.cost ?? 0) - (current.cost ?? 0)) > eps
  const purchaseChanged =
    next.purchaseCost !== current.purchaseCost &&
    !(next.purchaseCost == null && current.purchaseCost == null) &&
    Math.abs((next.purchaseCost ?? 0) - (current.purchaseCost ?? 0)) > eps

  if (!costChanged && !purchaseChanged) return false

  const reason = VALID_REASONS.has(opts.reason) ? opts.reason : 'manual_update'

  await prismaOrTx.ingredientCostHistory.create({
    data: {
      ingredientId,
      cost: Number(next.cost ?? 0),
      purchaseCost: next.purchaseCost != null ? Number(next.purchaseCost) : null,
      purchaseUnit: next.purchaseUnit ?? null,
      conversionFactor: next.conversionFactor != null ? Number(next.conversionFactor) : null,
      changedBy: opts.changedBy ?? null,
      reason,
    },
  })
  return true
}

module.exports = { recordCostChange, VALID_REASONS }
