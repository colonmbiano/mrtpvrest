-- BÓVEDA · el dinero del negocio que ya no está en la gaveta del turno.
-- Dos bolsas independientes: CASH (billetes) y DIGITAL (banco/tarjeta).
-- Ver packages/database/prisma/schema.prisma (model Vault) y lib/vault.js.
--
-- Escrita a mano (no por `migrate diff`) porque la BD de producción tiene
-- tablas `admin_*` que no viven en este schema y el diff automático las
-- proponía borrar. Aquí solo se crea lo nuevo; nada existente se altera
-- salvo el ADD VALUE del enum, que es aditivo.

-- CreateEnum
CREATE TYPE "VaultMovementType" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "VaultChannel" AS ENUM ('CASH', 'DIGITAL');

-- CreateEnum
CREATE TYPE "VaultSource" AS ENUM ('SHIFT_CLOSE', 'SHIFT_OPEN', 'MANUAL', 'EXPENSE', 'PURCHASE', 'SETTLEMENT');

-- AlterEnum
ALTER TYPE "ExpensePaymentMethod" ADD VALUE 'CASH_VAULT';

-- CreateTable
CREATE TABLE "vaults" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "balanceCash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balanceDigital" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_movements" (
    "id" TEXT NOT NULL,
    "vaultId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "type" "VaultMovementType" NOT NULL,
    "source" "VaultSource" NOT NULL,
    "channel" "VaultChannel" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "shiftId" TEXT,
    "operatingExpenseId" TEXT,
    "purchaseOrderId" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vaults_locationId_key" ON "vaults"("locationId");

-- CreateIndex
CREATE INDEX "vaults_restaurantId_idx" ON "vaults"("restaurantId");

-- CreateIndex
CREATE INDEX "vault_movements_vaultId_occurredAt_idx" ON "vault_movements"("vaultId", "occurredAt");

-- CreateIndex
CREATE INDEX "vault_movements_restaurantId_occurredAt_idx" ON "vault_movements"("restaurantId", "occurredAt");

-- CreateIndex
CREATE INDEX "vault_movements_operatingExpenseId_idx" ON "vault_movements"("operatingExpenseId");

-- CreateIndex
CREATE INDEX "vault_movements_purchaseOrderId_idx" ON "vault_movements"("purchaseOrderId");

-- CreateIndex
-- Idempotencia del ciclo de turno: un turno deposita al cerrar y retira al
-- abrir exactamente una vez POR CANAL. Postgres permite múltiples NULL en un
-- UNIQUE, así que los movimientos sin turno (compras, ajustes) no colisionan.
CREATE UNIQUE INDEX "vault_movements_shiftId_source_channel_key" ON "vault_movements"("shiftId", "source", "channel");

-- AddForeignKey
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_movements" ADD CONSTRAINT "vault_movements_vaultId_fkey" FOREIGN KEY ("vaultId") REFERENCES "vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_movements" ADD CONSTRAINT "vault_movements_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_movements" ADD CONSTRAINT "vault_movements_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_movements" ADD CONSTRAINT "vault_movements_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "cash_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_movements" ADD CONSTRAINT "vault_movements_operatingExpenseId_fkey" FOREIGN KEY ("operatingExpenseId") REFERENCES "operating_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_movements" ADD CONSTRAINT "vault_movements_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
