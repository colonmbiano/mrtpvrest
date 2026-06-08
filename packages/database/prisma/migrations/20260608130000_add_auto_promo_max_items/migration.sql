-- AlterTable
-- Idempotente: el deploy de Railway sólo corre `prisma generate`, no `migrate deploy`.
-- La columna se aplica manualmente a producción; IF NOT EXISTS evita conflicto si
-- un `migrate deploy` posterior re-ejecuta este archivo.
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "autoPromoMaxItems" INTEGER NOT NULL DEFAULT 0;
