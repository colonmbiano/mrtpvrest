-- Zonas configurables del salón (Terraza, Mostrador, Barra, Patio, etc.).
-- Cada Location tiene su propio set; las mesas pueden estar en una zona o
-- quedarse sin zona (zoneId = NULL) — útil para mesas extra que se sacan en
-- días no contemplados o mesas heredadas que aún no se clasificaron.
-- Migración aditiva: zoneId es nullable, así que las mesas existentes no
-- requieren backfill.

-- ── Tabla: zones ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "zones" (
  "id"         TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "icon"       TEXT,
  "order"      INTEGER NOT NULL DEFAULT 0,
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "zones_locationId_idx" ON "zones"("locationId");
CREATE UNIQUE INDEX IF NOT EXISTS "zones_locationId_name_key" ON "zones"("locationId", "name");

ALTER TABLE "zones"
  ADD CONSTRAINT "zones_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── tables.zoneId ───────────────────────────────────────────────────────────
ALTER TABLE "tables" ADD COLUMN IF NOT EXISTS "zoneId" TEXT;

CREATE INDEX IF NOT EXISTS "tables_zoneId_idx" ON "tables"("zoneId");

ALTER TABLE "tables"
  ADD CONSTRAINT "tables_zoneId_fkey"
  FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
