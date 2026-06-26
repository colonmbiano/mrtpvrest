-- FASE NÓMINA · Caja de empleado ("a cuenta" + descuento de empleado). Migración
-- ADITIVA: agrega un valor de enum, dos tipos nuevos, dos columnas y una tabla.
-- NO toca columnas calientes ni hace backfill. Estilo defensivo (IF NOT EXISTS /
-- duplicate_object) para aplicación manual segura a producción (Railway no aplica
-- migraciones — se corre `migrate deploy` a mano, coordinado con el deploy).
--
-- Modelo: un empleado puede consumir "a cuenta" desde el TPV (paymentMethod
-- EMPLOYEE_ACCOUNT) con un descuento de empleado; eso crea un employee_charges
-- PENDING que se descuenta de su raya y pasa a SETTLED cuando la corrida se paga.

-- ── Nuevo método de pago ─────────────────────────────────────────────────────
-- ADD VALUE IF NOT EXISTS es idempotente y, como NO usamos el valor en esta
-- misma migración, corre sin problema dentro de la transacción (PG12+).
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'EMPLOYEE_ACCOUNT';

-- ── Enums de la caja de empleado ─────────────────────────────────────────────
DO $$
BEGIN
  CREATE TYPE "EmployeeChargeType" AS ENUM ('CONSUMPTION', 'ADVANCE', 'ADJUSTMENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "EmployeeChargeStatus" AS ENUM ('PENDING', 'SETTLED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Columnas nuevas (descuento de empleado) ──────────────────────────────────
ALTER TABLE "payroll_config"
  ADD COLUMN IF NOT EXISTS "employeeDiscountPct" DECIMAL(5,2) NOT NULL DEFAULT 0;

ALTER TABLE "employee_pay_profiles"
  ADD COLUMN IF NOT EXISTS "discountPct" DECIMAL(5,2);

-- ── Tabla employee_charges ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "employee_charges" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "locationId" TEXT,
  "employeeId" TEXT,
  "employeeName" TEXT NOT NULL,
  "type" "EmployeeChargeType" NOT NULL DEFAULT 'CONSUMPTION',
  "status" "EmployeeChargeStatus" NOT NULL DEFAULT 'PENDING',
  "amount" DECIMAL(12,2) NOT NULL,
  "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "orderId" TEXT,
  "note" TEXT,
  "settledPeriodId" TEXT,
  "settledAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_charges_pkey" PRIMARY KEY ("id")
);

-- ── Uniques e índices ────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "employee_charges_orderId_key" ON "employee_charges"("orderId");
CREATE INDEX IF NOT EXISTS "employee_charges_restaurantId_idx" ON "employee_charges"("restaurantId");
CREATE INDEX IF NOT EXISTS "employee_charges_employeeId_status_idx" ON "employee_charges"("employeeId", "status");
CREATE INDEX IF NOT EXISTS "employee_charges_settledPeriodId_idx" ON "employee_charges"("settledPeriodId");

-- ── Llaves foráneas ──────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER TABLE "employee_charges" ADD CONSTRAINT "employee_charges_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "employee_charges" ADD CONSTRAINT "employee_charges_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "employee_charges" ADD CONSTRAINT "employee_charges_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "employee_charges" ADD CONSTRAINT "employee_charges_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "employee_charges" ADD CONSTRAINT "employee_charges_settledPeriodId_fkey" FOREIGN KEY ("settledPeriodId") REFERENCES "payroll_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
