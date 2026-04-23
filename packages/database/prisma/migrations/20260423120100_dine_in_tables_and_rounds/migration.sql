-- Dine-in: modelo Table, relación opcional Order.tableId y rondas de comanda.
-- Todo aditivo y retrocompatible: los flujos Quick Service (TAKEOUT/DELIVERY)
-- no referencian ninguna de estas columnas/tablas nuevas y siguen funcionando
-- sin cambios.

-- ── Enum TableStatus ────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'DIRTY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tabla: tables ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "tables" (
  "id"         TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "x"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "y"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status"     "TableStatus" NOT NULL DEFAULT 'AVAILABLE',
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "tables_locationId_idx" ON "tables"("locationId");
CREATE UNIQUE INDEX IF NOT EXISTS "tables_locationId_name_key" ON "tables"("locationId", "name");

ALTER TABLE "tables"
  ADD CONSTRAINT "tables_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── orders.tableId ──────────────────────────────────────────────────────────
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tableId" TEXT;

CREATE INDEX IF NOT EXISTS "orders_tableId_idx" ON "orders"("tableId");

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_tableId_fkey"
  FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Tabla: order_rounds ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "order_rounds" (
  "id"              TEXT NOT NULL,
  "orderId"         TEXT NOT NULL,
  "roundNumber"     INTEGER NOT NULL,
  "sentToKitchenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "order_rounds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "order_rounds_orderId_idx" ON "order_rounds"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "order_rounds_orderId_roundNumber_key" ON "order_rounds"("orderId", "roundNumber");

ALTER TABLE "order_rounds"
  ADD CONSTRAINT "order_rounds_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── order_items.roundId ─────────────────────────────────────────────────────
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "roundId" TEXT;

CREATE INDEX IF NOT EXISTS "order_items_roundId_idx" ON "order_items"("roundId");

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_roundId_fkey"
  FOREIGN KEY ("roundId") REFERENCES "order_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
