-- Reconciliación de drift schema <-> migraciones de la rama feature/marketplace-hibrido (2026-10-23).
-- Estos modelos y campos entraron a schema.prisma sin migración (commits 2ac327d8, b165eeed,
-- 63244df5, 9400b27d y 0d6a705f), así que `prisma migrate deploy` no los crearía:
--   tablas  delivery_incidents, delivery_evidence, marketplace_payments, marketplace_ledger_entries,
--           marketplace_driver_payouts, location_menu_item_promos, marketplace_order_pipelines (+5 enums);
--   locations.locationPromoEnabled / autoPromoActiveDays / autoPromoVersion;
--   llaves únicas (id, restaurantId) en orders, locations y menu_items, que las nuevas FKs referencian.
-- Generada SIN CONEXIÓN con `prisma migrate diff --from-schema <schema sin esos objetos>
-- --to-schema schema.prisma --script` y reescrita al estilo idempotente del repo. NO aplicada.
-- Solo agrega: no borra ni cambia tipos de nada existente. Si producción ya los tiene por
-- `prisma db push`, es un no-op.
-- Ojo al aplicarla: los CREATE UNIQUE INDEX sobre orders, locations y menu_items bloquean
-- escrituras en esas tablas mientras se construye el índice (sin CONCURRENTLY dentro de la
-- transacción de la migración). Programarla en una ventana de bajo tráfico.

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "MarketplaceLedgerAccount" AS ENUM ('GATEWAY_ESCROW', 'CUSTOMER_RECEIVABLE', 'MERCHANT_PAYABLE', 'COURIER_PAYABLE', 'PLATFORM_FEES', 'PLATFORM_PROMO_SUBSIDY', 'PAYOUT_CLEARING');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "MarketplaceLedgerEntryType" AS ENUM ('DEBIT', 'CREDIT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "MarketplaceLedgerEventType" AS ENUM ('ORDER_CAPTURED', 'ORDER_SETTLED', 'ORDER_REFUNDED', 'PAYOUT_DISBURSED', 'MANUAL_ADJUSTMENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "MarketplacePaymentStatus" AS ENUM ('PENDING', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUNDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "MarketplaceDriverPayoutStatus" AS ENUM ('PENDING', 'PAID');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "autoPromoActiveDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "autoPromoVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "locationPromoEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "delivery_incidents" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "notes" VARCHAR(4000) NOT NULL,
    "callAttempts" INTEGER NOT NULL DEFAULT 0,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "loggedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "photoBase64" TEXT,
    "photoMimeType" VARCHAR(32),
    "photoBytes" INTEGER,
    "idempotencyKey" VARCHAR(200),
    "requestHash" CHAR(64) NOT NULL,

    CONSTRAINT "delivery_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "delivery_evidence" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "photoBase64" TEXT,
    "signatureBase64" TEXT,
    "deliveredAt" TIMESTAMPTZ(3) NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestHash" CHAR(64) NOT NULL,

    CONSTRAINT "delivery_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_payments" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'MERCADOPAGO',
    "provider_payment_id" TEXT,
    "providerStatus" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "MarketplacePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "capturedAt" TIMESTAMPTZ(3),
    "refundedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "marketplace_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_ledger_entries" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "payoutId" TEXT,
    "transactionId" TEXT NOT NULL,
    "transactionHash" CHAR(64) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "eventType" "MarketplaceLedgerEventType" NOT NULL,
    "account" "MarketplaceLedgerAccount" NOT NULL,
    "beneficiaryId" TEXT,
    "type" "MarketplaceLedgerEntryType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "referenceId" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_driver_payouts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "status" "MarketplaceDriverPayoutStatus" NOT NULL DEFAULT 'PENDING',
    "requestKey" VARCHAR(200) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedBy" TEXT,
    "approvalKey" VARCHAR(200),
    "approvalHash" CHAR(64),
    "paymentReference" VARCHAR(200),
    "paidAt" TIMESTAMPTZ(3),

    CONSTRAINT "marketplace_driver_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "location_menu_item_promos" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "isPromo" BOOLEAN NOT NULL DEFAULT false,
    "promoPrice" DECIMAL(18,2),
    "activeDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "promoSource" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "location_menu_item_promos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_order_pipelines" (
    "orderId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "storeSlug" TEXT NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "trackingTokenHash" CHAR(64) NOT NULL,
    "trackingExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "pinKeyId" TEXT NOT NULL,
    "pickupPinHash" CHAR(64) NOT NULL,
    "deliveryPinHash" CHAR(64) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "collectorId" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "settlement" JSONB NOT NULL,
    "dispatch" JSONB,
    "checkoutUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "marketplace_order_pipelines_pkey" PRIMARY KEY ("orderId")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "delivery_incidents_restaurantId_orderId_loggedAt_id_idx" ON "delivery_incidents"("restaurantId", "orderId", "loggedAt", "id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "delivery_incidents_orderId_restaurantId_idx" ON "delivery_incidents"("orderId", "restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_incidents_restaurantId_orderId_idempotencyKey_key" ON "delivery_incidents"("restaurantId", "orderId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_evidence_orderId_key" ON "delivery_evidence"("orderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "delivery_evidence_restaurantId_orderId_idx" ON "delivery_evidence"("restaurantId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_evidence_orderId_restaurantId_key" ON "delivery_evidence"("orderId", "restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_payments_idempotencyKey_key" ON "marketplace_payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_payments_orderId_restaurantId_idx" ON "marketplace_payments"("orderId", "restaurantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_payments_restaurantId_status_createdAt_idx" ON "marketplace_payments"("restaurantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_payments_provider_provider_payment_id_key" ON "marketplace_payments"("provider", "provider_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_payments_id_restaurantId_orderId_key" ON "marketplace_payments"("id", "restaurantId", "orderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_ledger_entries_transactionId_idx" ON "marketplace_ledger_entries"("transactionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_ledger_entries_payoutId_restaurantId_idx" ON "marketplace_ledger_entries"("payoutId", "restaurantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_ledger_entries_restaurantId_orderId_createdAt_idx" ON "marketplace_ledger_entries"("restaurantId", "orderId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_ledger_entries_restaurantId_account_beneficiary_idx" ON "marketplace_ledger_entries"("restaurantId", "account", "beneficiaryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_ledger_entries_paymentId_idempotencyKey_lineNum_key" ON "marketplace_ledger_entries"("paymentId", "idempotencyKey", "lineNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_driver_payouts_restaurantId_driverId_status_idx" ON "marketplace_driver_payouts"("restaurantId", "driverId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_driver_payouts_restaurantId_driverId_requestedA_idx" ON "marketplace_driver_payouts"("restaurantId", "driverId", "requestedAt", "id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_driver_payouts_driverId_idx" ON "marketplace_driver_payouts"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_driver_payouts_id_restaurantId_key" ON "marketplace_driver_payouts"("id", "restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_driver_payouts_restaurantId_driverId_requestKey_key" ON "marketplace_driver_payouts"("restaurantId", "driverId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_driver_payouts_restaurantId_approvalKey_key" ON "marketplace_driver_payouts"("restaurantId", "approvalKey");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_driver_payouts_restaurantId_paymentReference_key" ON "marketplace_driver_payouts"("restaurantId", "paymentReference");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "location_menu_item_promos_restaurantId_locationId_idx" ON "location_menu_item_promos"("restaurantId", "locationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "location_menu_item_promos_menuItemId_restaurantId_idx" ON "location_menu_item_promos"("menuItemId", "restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "location_menu_item_promos_locationId_menuItemId_key" ON "location_menu_item_promos"("locationId", "menuItemId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_order_pipelines_restaurantId_createdAt_idx" ON "marketplace_order_pipelines"("restaurantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_order_pipelines_orderId_restaurantId_key" ON "marketplace_order_pipelines"("orderId", "restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "locations_id_restaurantId_key" ON "locations"("id", "restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "menu_items_id_restaurantId_key" ON "menu_items"("id", "restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "orders_id_restaurantId_key" ON "orders"("id", "restaurantId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_incidents_orderId_restaurantId_fkey') THEN
    ALTER TABLE "delivery_incidents" ADD CONSTRAINT "delivery_incidents_orderId_restaurantId_fkey" FOREIGN KEY ("orderId", "restaurantId") REFERENCES "orders"("id", "restaurantId") ON DELETE RESTRICT ON UPDATE RESTRICT;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_evidence_orderId_restaurantId_fkey') THEN
    ALTER TABLE "delivery_evidence" ADD CONSTRAINT "delivery_evidence_orderId_restaurantId_fkey" FOREIGN KEY ("orderId", "restaurantId") REFERENCES "orders"("id", "restaurantId") ON DELETE RESTRICT ON UPDATE RESTRICT;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_payments_orderId_restaurantId_fkey') THEN
    ALTER TABLE "marketplace_payments" ADD CONSTRAINT "marketplace_payments_orderId_restaurantId_fkey" FOREIGN KEY ("orderId", "restaurantId") REFERENCES "orders"("id", "restaurantId") ON DELETE RESTRICT ON UPDATE RESTRICT;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_ledger_entries_paymentId_restaurantId_orderId_fkey') THEN
    ALTER TABLE "marketplace_ledger_entries" ADD CONSTRAINT "marketplace_ledger_entries_paymentId_restaurantId_orderId_fkey" FOREIGN KEY ("paymentId", "restaurantId", "orderId") REFERENCES "marketplace_payments"("id", "restaurantId", "orderId") ON DELETE RESTRICT ON UPDATE RESTRICT;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_ledger_entries_payoutId_restaurantId_fkey') THEN
    ALTER TABLE "marketplace_ledger_entries" ADD CONSTRAINT "marketplace_ledger_entries_payoutId_restaurantId_fkey" FOREIGN KEY ("payoutId", "restaurantId") REFERENCES "marketplace_driver_payouts"("id", "restaurantId") ON DELETE RESTRICT ON UPDATE RESTRICT;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_driver_payouts_restaurantId_fkey') THEN
    ALTER TABLE "marketplace_driver_payouts" ADD CONSTRAINT "marketplace_driver_payouts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_driver_payouts_driverId_fkey') THEN
    ALTER TABLE "marketplace_driver_payouts" ADD CONSTRAINT "marketplace_driver_payouts_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'location_menu_item_promos_locationId_restaurantId_fkey') THEN
    ALTER TABLE "location_menu_item_promos" ADD CONSTRAINT "location_menu_item_promos_locationId_restaurantId_fkey" FOREIGN KEY ("locationId", "restaurantId") REFERENCES "locations"("id", "restaurantId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'location_menu_item_promos_menuItemId_restaurantId_fkey') THEN
    ALTER TABLE "location_menu_item_promos" ADD CONSTRAINT "location_menu_item_promos_menuItemId_restaurantId_fkey" FOREIGN KEY ("menuItemId", "restaurantId") REFERENCES "menu_items"("id", "restaurantId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_order_pipelines_orderId_restaurantId_fkey') THEN
    ALTER TABLE "marketplace_order_pipelines" ADD CONSTRAINT "marketplace_order_pipelines_orderId_restaurantId_fkey" FOREIGN KEY ("orderId", "restaurantId") REFERENCES "orders"("id", "restaurantId") ON DELETE RESTRICT ON UPDATE RESTRICT;
  END IF;
END $$;
