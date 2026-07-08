-- Ventana horaria diaria opcional para promos NxM ("HH:mm" hora local).
-- endTime '21:00' = la promo deja de aplicar después de las 9 pm.
ALTER TABLE "bulk_promos" ADD COLUMN "startTime" TEXT;
ALTER TABLE "bulk_promos" ADD COLUMN "endTime" TEXT;
