-- C5: estado de cuenta mensual de comisiones del Mercadito (pedidos en efectivo).
-- Solo agrega un tipo y una tabla nueva; la versión anterior del backend no la usa.

-- CreateEnum
CREATE TYPE "MarketplaceCommissionStatementStatus" AS ENUM ('ISSUED', 'PAID');

-- CreateTable
CREATE TABLE "marketplace_commission_statements" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "period" CHAR(7) NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "status" "MarketplaceCommissionStatementStatus" NOT NULL DEFAULT 'ISSUED',
    "ordersCount" INTEGER NOT NULL,
    "salesCents" INTEGER NOT NULL,
    "commissionCents" INTEGER NOT NULL,
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

    CONSTRAINT "marketplace_commission_statements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketplace_commission_statements_period_status_idx" ON "marketplace_commission_statements"("period", "status");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_commission_statements_restaurantId_period_key" ON "marketplace_commission_statements"("restaurantId", "period");

-- AddForeignKey
ALTER TABLE "marketplace_commission_statements" ADD CONSTRAINT "marketplace_commission_statements_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Integridad que Prisma no expresa: montos no negativos y un estado PAID siempre con fecha y autor.
ALTER TABLE "marketplace_commission_statements" ADD CONSTRAINT "marketplace_commission_statements_amounts_check"
  CHECK ("ordersCount" >= 0 AND "salesCents" >= 0 AND "commissionCents" >= 0 AND "commissionCents" <= "salesCents");
ALTER TABLE "marketplace_commission_statements" ADD CONSTRAINT "marketplace_commission_statements_paid_check"
  CHECK ("status" = 'ISSUED' OR ("paidAt" IS NOT NULL AND "paidBy" IS NOT NULL));
