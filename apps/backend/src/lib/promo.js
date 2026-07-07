// Promo de lanzamiento (julio 2026) — un solo plan activo con acceso total.
//
// Los primeros FOUNDERS_LIMIT tenants que se suscriben al plan promo reciben
// FOUNDERS_TRIAL_DAYS de prueba gratis; a partir de ahí, todo tenant nuevo
// recibe REGULAR_TRIAL_DAYS. Un "lugar de fundador" se ocupa por suscripción
// creada en el plan (cuenta todas sin importar status, para que cancelar o
// expirar no re-abra lugares).
//
// El plan FULL_ACCESS vive en la tabla `plans` (creado por SQL directo, sin
// migración). Para terminar o ajustar la promo basta con editar estas
// constantes o cambiar el plan desde /planes en el panel SaaS.

const PROMO_PLAN_NAME     = 'FULL_ACCESS'
const FOUNDERS_LIMIT      = 100
const FOUNDERS_TRIAL_DAYS = 180 // 6 meses
const REGULAR_TRIAL_DAYS  = 90  // 3 meses

/**
 * Días de trial efectivos para una suscripción nueva en `plan`.
 * Para planes fuera de la promo devuelve plan.trialDays tal cual.
 */
async function resolveTrialDays(prisma, plan) {
  if (!plan || plan.name !== PROMO_PLAN_NAME) return plan?.trialDays ?? 0
  const taken = await prisma.subscription.count({ where: { planId: plan.id } })
  return taken < FOUNDERS_LIMIT ? FOUNDERS_TRIAL_DAYS : REGULAR_TRIAL_DAYS
}

/**
 * Decora la lista pública de planes (GET /api/saas/plans) con el trial
 * efectivo y, para el plan promo, los lugares de fundador restantes
 * (`foundersLeft`) para que el registro pueda mostrar urgencia.
 */
async function decoratePublicPlans(prisma, plans) {
  return Promise.all(plans.map(async (plan) => {
    if (plan.name !== PROMO_PLAN_NAME) return plan
    const taken = await prisma.subscription.count({ where: { planId: plan.id } })
    const foundersLeft = Math.max(0, FOUNDERS_LIMIT - taken)
    return {
      ...plan,
      trialDays: foundersLeft > 0 ? FOUNDERS_TRIAL_DAYS : REGULAR_TRIAL_DAYS,
      foundersLeft,
    }
  }))
}

module.exports = {
  PROMO_PLAN_NAME,
  FOUNDERS_LIMIT,
  FOUNDERS_TRIAL_DAYS,
  REGULAR_TRIAL_DAYS,
  resolveTrialDays,
  decoratePublicPlans,
}
