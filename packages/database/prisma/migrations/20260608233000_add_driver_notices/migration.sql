-- CreateTable
-- Idempotente: el deploy de Railway sólo corre `prisma generate`, no migrate deploy.
-- La tabla se aplica manualmente a producción (Supabase). IF NOT EXISTS evita
-- conflicto si un `migrate deploy` posterior re-ejecuta este archivo.
CREATE TABLE IF NOT EXISTS "driver_notices" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "locationId" TEXT,
    "driverId" TEXT,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "readBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "driver_notices_restaurantId_createdAt_idx" ON "driver_notices"("restaurantId", "createdAt");
