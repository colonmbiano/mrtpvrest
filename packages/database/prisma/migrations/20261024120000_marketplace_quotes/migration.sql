-- Marketplace: cotizaciones v1 (2026-10-24).
-- Precio congelado en centavos que la orden del marketplace consume una sola vez.
-- Generada SIN CONEXIÓN con `prisma migrate diff --from-schema <schema anterior>
-- --to-schema schema.prisma --script` y reescrita al estilo idempotente del repo.
-- NO aplicada. Solo agrega: una tabla, cinco índices y una llave foránea.

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_quotes" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "fulfillment" TEXT NOT NULL,
    "deliveryAddressId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "itemsSnapshot" JSONB NOT NULL,
    "priceSnapshot" JSONB NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "idempotencyKeyHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "orderId" TEXT,
    "requestKeyHash" CHAR(64),

    CONSTRAINT "marketplace_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_quotes_idempotencyKeyHash_key" ON "marketplace_quotes"("idempotencyKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_quotes_orderId_key" ON "marketplace_quotes"("orderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_quotes_accountId_createdAt_idx" ON "marketplace_quotes"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_quotes_merchantId_createdAt_idx" ON "marketplace_quotes"("merchantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_quotes_accountId_requestKeyHash_key" ON "marketplace_quotes"("accountId", "requestKeyHash");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_quotes_merchantId_fkey') THEN
    ALTER TABLE "marketplace_quotes" ADD CONSTRAINT "marketplace_quotes_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
