-- FASE 4 · Módulo Logística/Flota
-- Crea enums VehicleType/ExpenseCategory y tablas vehicles/rides/expenses.
-- Todas las entidades son aditivas y NO modifican tablas existentes, así que
-- es seguro aplicar sobre BDs en producción: los tenants sin hasDelivery=true
-- simplemente no ven la UI que las consume.

-- ── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "VehicleType" AS ENUM ('MOTO', 'CARRO', 'BICI');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ExpenseCategory" AS ENUM ('GASOLINA', 'REFACCION', 'PONCHADURA', 'OTROS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tabla: vehicles ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vehicles" (
  "id"        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "plate"     TEXT,
  "type"      "VehicleType" NOT NULL DEFAULT 'MOTO',
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vehicles_tenantId_idx" ON "vehicles"("tenantId");

ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Tabla: rides ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "rides" (
  "id"           TEXT NOT NULL,
  "tenantId"     TEXT NOT NULL,
  "employeeId"   TEXT NOT NULL,
  "vehicleId"    TEXT NOT NULL,
  "startTime"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endTime"      TIMESTAMP(3),
  "startMileage" INTEGER,
  "endMileage"   INTEGER,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "rides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "rides_tenantId_idx"   ON "rides"("tenantId");
CREATE INDEX IF NOT EXISTS "rides_vehicleId_idx"  ON "rides"("vehicleId");
CREATE INDEX IF NOT EXISTS "rides_employeeId_idx" ON "rides"("employeeId");

ALTER TABLE "rides"
  ADD CONSTRAINT "rides_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rides"
  ADD CONSTRAINT "rides_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Tabla: expenses ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "expenses" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "rideId"      TEXT,
  "amount"      DECIMAL(10,2) NOT NULL,
  "category"    "ExpenseCategory" NOT NULL,
  "description" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "expenses_tenantId_idx" ON "expenses"("tenantId");
CREATE INDEX IF NOT EXISTS "expenses_rideId_idx"   ON "expenses"("rideId");

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_rideId_fkey"
  FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;
