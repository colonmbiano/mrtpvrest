-- Reconciliación de drift schema <-> migraciones (2026-06-12).
-- Estas estructuras entraron a producción vía `prisma db push` SIN migración,
-- así que las BDs construidas desde migraciones (E2E en CI, entornos nuevos)
-- no las tenían y el seed fallaba (P2022 tenants.welcomeEmailSent).
-- Todo es idempotente: en producción esta migración es un no-op.

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN IF NOT EXISTS "isPendingReview" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TicketConfig" ADD COLUMN IF NOT EXISTS "businessType" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "invoiceFolioPrefix" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "invoiceUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "logoUrl" TEXT,
ADD COLUMN IF NOT EXISTS "rfc" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "showInvoiceQr" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "kitchenHeader" SET DEFAULT '';

-- AlterTable
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "preparationSteps" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "subrecipes" ADD COLUMN IF NOT EXISTS "isPendingReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "preparationSteps" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "welcomeEmailSent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "tenant_modules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "requiresPlan" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Promo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tenant_modules_tenantId_idx" ON "tenant_modules"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_modules_tenantId_moduleKey_key" ON "tenant_modules"("tenantId", "moduleKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Promo_tenantId_idx" ON "Promo"("tenantId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_modules_tenantId_fkey') THEN
    ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Promo_tenantId_fkey') THEN
    ALTER TABLE "Promo" ADD CONSTRAINT "Promo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
