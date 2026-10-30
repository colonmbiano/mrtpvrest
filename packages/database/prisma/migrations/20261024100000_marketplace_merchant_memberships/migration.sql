-- Marketplace: aprobación de comercios para el directorio (2026-10-24).
-- Un negocio con el módulo "marketplace" solicita aparecer en el directorio y la
-- plataforma (SUPER_ADMIN) lo aprueba, rechaza o suspende. Una fila por restaurante.
-- Generada SIN CONEXIÓN con `prisma migrate diff --from-schema <schema anterior>
-- --to-schema schema.prisma --script` y reescrita al estilo idempotente del repo.
-- NO aplicada. Solo agrega: una tabla, un enum, dos índices y una llave foránea.

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "MarketplaceMembershipStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_merchant_memberships" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "status" "MarketplaceMembershipStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_merchant_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_merchant_memberships_restaurantId_key" ON "marketplace_merchant_memberships"("restaurantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_merchant_memberships_status_requestedAt_idx" ON "marketplace_merchant_memberships"("status", "requestedAt");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_merchant_memberships_restaurantId_fkey') THEN
    ALTER TABLE "marketplace_merchant_memberships" ADD CONSTRAINT "marketplace_merchant_memberships_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
