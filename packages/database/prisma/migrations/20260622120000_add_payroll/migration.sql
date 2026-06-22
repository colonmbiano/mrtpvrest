-- FASE NÓMINA · Pago a empleados ("la raya"). Migración ADITIVA: solo crea
-- tipos y tablas nuevas, no toca columnas calientes ni hace backfill. Estilo
-- defensivo (IF NOT EXISTS / duplicate_object) para aplicación manual segura
-- a producción (Railway no aplica migraciones — se corre `migrate deploy` a mano).
--
-- Esquema por defecto: pago POR DÍA TRABAJADO (un día = al menos un EmployeeShift
-- ese día). Periodo de la raya configurable en días. Capa fiscal (CFDI/IMSS)
-- queda OPCIONAL vía payroll_config.fiscalEnabled (off por defecto).

-- ── Enums ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  CREATE TYPE "PayType" AS ENUM ('DAILY', 'HOURLY', 'WEEKLY_FIXED', 'PER_DELIVERY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "TipPolicy" AS ENUM ('INDIVIDUAL', 'POOL_BY_ROLE', 'POOL_ALL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── Tablas ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payroll_config" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "periodLengthDays" INTEGER NOT NULL DEFAULT 7,
  "defaultPayType" "PayType" NOT NULL DEFAULT 'DAILY',
  "tipPolicy" "TipPolicy" NOT NULL DEFAULT 'INDIVIDUAL',
  "currency" TEXT NOT NULL DEFAULT 'MXN',
  "fiscalEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_config_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "employee_pay_profiles" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "payType" "PayType" NOT NULL DEFAULT 'DAILY',
  "dailyRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "hourlyRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "fixedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "perDeliveryRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_pay_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payroll_periods" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "periodFrom" TIMESTAMP(3) NOT NULL,
  "periodTo" TIMESTAMP(3) NOT NULL,
  "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "totalNet" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "paidById" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "payroll_items" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "periodId" TEXT NOT NULL,
  "employeeId" TEXT,
  "employeeName" TEXT NOT NULL,
  "role" TEXT,
  "payType" "PayType" NOT NULL DEFAULT 'DAILY',
  "daysWorked" INTEGER NOT NULL DEFAULT 0,
  "rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "gross" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "tips" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "commission" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "additions" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "advancesDeducted" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "net" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "payMethod" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- ── Uniques e índices ────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_config_restaurantId_key" ON "payroll_config"("restaurantId");
CREATE UNIQUE INDEX IF NOT EXISTS "employee_pay_profiles_employeeId_key" ON "employee_pay_profiles"("employeeId");
CREATE INDEX IF NOT EXISTS "employee_pay_profiles_restaurantId_idx" ON "employee_pay_profiles"("restaurantId");
CREATE INDEX IF NOT EXISTS "payroll_periods_restaurantId_idx" ON "payroll_periods"("restaurantId");
CREATE INDEX IF NOT EXISTS "payroll_periods_locationId_periodFrom_idx" ON "payroll_periods"("locationId", "periodFrom");
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_items_periodId_employeeId_key" ON "payroll_items"("periodId", "employeeId");
CREATE INDEX IF NOT EXISTS "payroll_items_restaurantId_idx" ON "payroll_items"("restaurantId");
CREATE INDEX IF NOT EXISTS "payroll_items_periodId_idx" ON "payroll_items"("periodId");
CREATE INDEX IF NOT EXISTS "payroll_items_employeeId_idx" ON "payroll_items"("employeeId");

-- ── Llaves foráneas ──────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER TABLE "payroll_config" ADD CONSTRAINT "payroll_config_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "employee_pay_profiles" ADD CONSTRAINT "employee_pay_profiles_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "employee_pay_profiles" ADD CONSTRAINT "employee_pay_profiles_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
