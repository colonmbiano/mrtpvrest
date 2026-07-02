-- Etapa 1 de la migración Float→Decimal (docs/plan-decimal-migration.md):
-- piloto de bajo riesgo en Coupon. USING round(...,2) limpia el ruido binario
-- de los floats existentes (50.00000000000001 → 50.00).
ALTER TABLE "coupons"
  ALTER COLUMN "discountValue" TYPE DECIMAL(12,2) USING round("discountValue"::numeric, 2),
  ALTER COLUMN "minOrderAmount" TYPE DECIMAL(12,2) USING round("minOrderAmount"::numeric, 2);
