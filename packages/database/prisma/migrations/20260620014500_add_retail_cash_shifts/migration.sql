-- Caja/turno retail (RetailCashShift + RetailCashMovement) y enlace de ventas a la caja.
-- Esta migracion es defensiva porque prod ya habia aplicado una version previa
-- de 20260618090000 sin caja y una primera ejecucion parcial creo las tablas.
DO $$
BEGIN
  CREATE TYPE "RetailShiftStatus" AS ENUM ('OPEN', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "RetailCashMovementType" AS ENUM ('CASH_IN', 'CASH_OUT', 'EXPENSE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "retail_sales" ADD COLUMN IF NOT EXISTS "shiftId" TEXT;

CREATE TABLE IF NOT EXISTS "retail_cash_shifts" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "deviceId" TEXT,
  "openedById" TEXT,
  "openedByName" TEXT,
  "closedById" TEXT,
  "status" "RetailShiftStatus" NOT NULL DEFAULT 'OPEN',
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "openingFloat" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "countedCash" DECIMAL(12,2),
  "expectedCash" DECIMAL(12,2),
  "difference" DECIMAL(12,2),
  "blindClose" BOOLEAN NOT NULL DEFAULT false,
  "totalCashSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalCardSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalTransferSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalCashIn" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalCashOut" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "salesCount" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "retail_cash_shifts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "retail_cash_movements" (
  "id" TEXT NOT NULL,
  "shiftId" TEXT NOT NULL,
  "type" "RetailCashMovementType" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "reason" TEXT,
  "category" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "retail_cash_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "retail_cash_shifts_restaurantId_status_idx" ON "retail_cash_shifts"("restaurantId", "status");
CREATE INDEX IF NOT EXISTS "retail_cash_shifts_locationId_status_idx" ON "retail_cash_shifts"("locationId", "status");
CREATE INDEX IF NOT EXISTS "retail_cash_movements_shiftId_idx" ON "retail_cash_movements"("shiftId");
CREATE INDEX IF NOT EXISTS "retail_sales_shiftId_idx" ON "retail_sales"("shiftId");

DO $$
BEGIN
  ALTER TABLE "retail_cash_shifts" ADD CONSTRAINT "retail_cash_shifts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "retail_cash_shifts" ADD CONSTRAINT "retail_cash_shifts_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "retail_cash_shifts" ADD CONSTRAINT "retail_cash_shifts_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "retail_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "retail_cash_movements" ADD CONSTRAINT "retail_cash_movements_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "retail_cash_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "retail_cash_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
