-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "restaurant_config" ADD COLUMN     "centralWarehouseEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "isCentralWarehouse" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "fromLocationId" TEXT NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'COMPLETED',
    "notes" TEXT,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" TEXT NOT NULL,
    "stockTransferId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "toLocationId" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unitCostAtMove" DOUBLE PRECISION,

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_transfers_restaurantId_createdAt_idx" ON "stock_transfers"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_transfers_fromLocationId_idx" ON "stock_transfers"("fromLocationId");

-- CreateIndex
CREATE INDEX "stock_transfer_items_stockTransferId_idx" ON "stock_transfer_items"("stockTransferId");

-- CreateIndex
CREATE INDEX "stock_transfer_items_ingredientId_idx" ON "stock_transfer_items"("ingredientId");

-- CreateIndex
CREATE INDEX "stock_transfer_items_toLocationId_idx" ON "stock_transfer_items"("toLocationId");

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_stockTransferId_fkey" FOREIGN KEY ("stockTransferId") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
