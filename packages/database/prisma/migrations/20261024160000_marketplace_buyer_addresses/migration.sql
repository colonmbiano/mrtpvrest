-- Marketplace: libreta de direcciones del comprador de la API v1 (2026-10-24).
-- La cotización y la orden con entrega a domicilio leen la dirección de aquí, por su id.
-- Generada SIN CONEXIÓN con `prisma migrate diff --from-schema <schema anterior>
-- --to-schema schema.prisma --script` y reescrita al estilo idempotente del repo.
-- NO aplicada. Solo agrega: una tabla y dos índices.

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_buyer_addresses" (
    "id" TEXT NOT NULL,
    "accountId" VARCHAR(64) NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "address" VARCHAR(500) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "marketplace_buyer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_buyer_addresses_accountId_updatedAt_idx" ON "marketplace_buyer_addresses"("accountId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_buyer_addresses_accountId_fingerprint_key" ON "marketplace_buyer_addresses"("accountId", "fingerprint");
