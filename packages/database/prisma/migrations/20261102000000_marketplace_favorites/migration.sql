-- Marketplace: tiendas favoritas del comprador de la app del cliente (2026-11-02).
-- Es del comprador, no de un tenant: la tienda va en merchantId (sin restaurantId).
-- Escrita al estilo idempotente del repo y comprobada con `prisma migrate diff` en una
-- base desechable. Solo agrega: una tabla, dos índices y su llave foránea a restaurants.

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_favorites" (
    "id" TEXT NOT NULL,
    "accountId" VARCHAR(64) NOT NULL,
    "merchantId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_favorites_accountId_createdAt_idx" ON "marketplace_favorites"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_favorites_accountId_merchantId_key" ON "marketplace_favorites"("accountId", "merchantId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "marketplace_favorites" ADD CONSTRAINT "marketplace_favorites_merchantId_fkey"
    FOREIGN KEY ("merchantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
