-- CreateTable
-- Idempotente: el deploy de Railway sólo corre `prisma generate`, no migrate deploy.
-- La tabla se aplica manualmente a producción (Supabase). IF NOT EXISTS evita
-- conflicto si un `migrate deploy` posterior re-ejecuta este archivo.
CREATE TABLE IF NOT EXISTS "driver_shift_requests" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "locationId" TEXT,
    "driverId" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_shift_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "driver_shift_requests_restaurantId_status_createdAt_idx" ON "driver_shift_requests"("restaurantId", "status", "createdAt");

-- RLS: el backend accede vía Prisma con rol de servicio (bypassa RLS), igual que
-- el resto de tablas. La habilitamos sin políticas para no exponer la tabla al
-- anon key de Supabase. No rompe el acceso del backend.
ALTER TABLE "driver_shift_requests" ENABLE ROW LEVEL SECURITY;
