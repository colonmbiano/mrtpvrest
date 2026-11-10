-- C8: corte diario del repartidor independiente con cada comercio (100% del envío, pago diario).
-- Solo agrega un tipo y una tabla nueva; la versión anterior del backend no la usa.

-- CreateEnum
CREATE TYPE "MarketplaceCourierPayoutStatus" AS ENUM ('ISSUED', 'PAID');

-- CreateTable
CREATE TABLE "marketplace_courier_payouts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "businessDate" CHAR(10) NOT NULL,
    "dayStart" TIMESTAMPTZ(3) NOT NULL,
    "dayEnd" TIMESTAMPTZ(3) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "status" "MarketplaceCourierPayoutStatus" NOT NULL DEFAULT 'ISSUED',
    "deliveriesCount" INTEGER NOT NULL,
    "earningsCents" INTEGER NOT NULL,
    "cashCollectedCents" INTEGER NOT NULL,
    "cashToMerchantCents" INTEGER NOT NULL,
    "onlineEarningsCents" INTEGER NOT NULL,
    "netCents" INTEGER NOT NULL,
    "lines" JSONB NOT NULL,
    "linesHash" CHAR(64) NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedBy" TEXT NOT NULL,
    "paidAt" TIMESTAMPTZ(3),
    "paidBy" TEXT,
    "paymentReference" VARCHAR(200),
    "paymentNote" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "marketplace_courier_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketplace_courier_payouts_courierId_businessDate_idx" ON "marketplace_courier_payouts"("courierId", "businessDate");

-- CreateIndex
CREATE INDEX "marketplace_courier_payouts_businessDate_status_idx" ON "marketplace_courier_payouts"("businessDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_courier_payouts_restaurantId_courierId_business_key" ON "marketplace_courier_payouts"("restaurantId", "courierId", "businessDate");

-- AddForeignKey
ALTER TABLE "marketplace_courier_payouts" ADD CONSTRAINT "marketplace_courier_payouts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Integridad que Prisma no expresa.
ALTER TABLE "marketplace_courier_payouts" ADD CONSTRAINT "marketplace_courier_payouts_amounts_check"
  CHECK ("deliveriesCount" >= 0 AND "earningsCents" >= 0 AND "cashCollectedCents" >= 0 AND "cashToMerchantCents" >= 0
    AND "onlineEarningsCents" >= 0 AND "onlineEarningsCents" <= "earningsCents"
    AND "netCents" = "onlineEarningsCents" - "cashToMerchantCents");
ALTER TABLE "marketplace_courier_payouts" ADD CONSTRAINT "marketplace_courier_payouts_paid_check"
  CHECK ("status" = 'ISSUED' OR ("paidAt" IS NOT NULL AND "paidBy" IS NOT NULL));
