-- Fase 13: Capacidades por sucursal
-- Añade flags de capacidad operativa al modelo Location.
-- Defaults pensados para restaurante tradicional; bares/antros típicamente
-- desactivan delivery/takeaway/tableMap y activan openTabs.
-- IF NOT EXISTS para que sea idempotente sobre BDs que ya tengan las columnas.

ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "hasDelivery" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "hasTakeaway" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "hasTableMap" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "hasOpenTabs" BOOLEAN NOT NULL DEFAULT false;
