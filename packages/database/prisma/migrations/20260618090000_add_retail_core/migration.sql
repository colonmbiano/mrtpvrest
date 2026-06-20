-- Retail core for SKU-based stores. This is intentionally separate from the
-- restaurant MenuItem/Ingredient inventory model.

CREATE TYPE "RetailSaleStatus" AS ENUM ('COMPLETED', 'CANCELLED', 'PARTIAL_RETURN', 'RETURNED');
CREATE TYPE "RetailPaymentMethod" AS ENUM ('CASH', 'CARD_PRESENT', 'TRANSFER', 'COURTESY');
CREATE TYPE "RetailTransferStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');
CREATE TYPE "RetailStockMovementReason" AS ENUM ('PURCHASE', 'SALE', 'RETURN', 'CANCEL', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'PHYSICAL_COUNT');
CREATE TYPE "RetailOutboxStatus" AS ENUM ('PENDING', 'APPLIED', 'FAILED');

CREATE TABLE "retail_products" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "brand" TEXT,
  "category" TEXT,
  "gender" TEXT,
  "season" TEXT,
  "imageUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "retail_products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retail_skus" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "barcode" TEXT,
  "size" TEXT,
  "color" TEXT,
  "material" TEXT,
  "style" TEXT,
  "price" DECIMAL(12,2) NOT NULL,
  "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "imageUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "retail_skus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retail_stock_by_location" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "skuId" TEXT NOT NULL,
  "qty" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "minQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "retail_stock_by_location_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retail_stock_movements" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "skuId" TEXT NOT NULL,
  "delta" DECIMAL(12,3) NOT NULL,
  "reason" "RetailStockMovementReason" NOT NULL,
  "refType" TEXT,
  "refId" TEXT,
  "balanceAfter" DECIMAL(12,3) NOT NULL,
  "unitCostAtMove" DECIMAL(12,4),
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "retail_stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retail_devices" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "deviceKey" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'WINDOWS',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastSyncAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "retail_devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retail_sales" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "deviceId" TEXT,
  "shiftId" TEXT,
  "clientSaleId" TEXT NOT NULL,
  "folio" TEXT NOT NULL,
  "status" "RetailSaleStatus" NOT NULL DEFAULT 'COMPLETED',
  "subtotal" DECIMAL(12,2) NOT NULL,
  "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(12,2) NOT NULL,
  "customerName" TEXT,
  "customerPhone" TEXT,
  "notes" TEXT,
  "createdById" TEXT,
  "syncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "retail_sales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retail_sale_lines" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "skuId" TEXT NOT NULL,
  "skuCode" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "variantLabel" TEXT,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "subtotal" DECIMAL(12,2) NOT NULL,
  "costSnapshot" DECIMAL(14,4) NOT NULL DEFAULT 0,
  CONSTRAINT "retail_sale_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retail_payments" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "method" "RetailPaymentMethod" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "reference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "retail_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retail_transfers" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "fromLocationId" TEXT NOT NULL,
  "status" "RetailTransferStatus" NOT NULL DEFAULT 'COMPLETED',
  "notes" TEXT,
  "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "retail_transfers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retail_transfer_items" (
  "id" TEXT NOT NULL,
  "transferId" TEXT NOT NULL,
  "skuId" TEXT NOT NULL,
  "toLocationId" TEXT NOT NULL,
  "qty" DECIMAL(12,3) NOT NULL,
  "unitCostAtMove" DECIMAL(12,4),
  CONSTRAINT "retail_transfer_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "retail_sync_outbox" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "deviceId" TEXT,
  "clientEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "RetailOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "retail_sync_outbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "retail_products_restaurantId_isActive_idx" ON "retail_products"("restaurantId", "isActive");
CREATE INDEX "retail_products_restaurantId_category_idx" ON "retail_products"("restaurantId", "category");
CREATE UNIQUE INDEX "retail_skus_restaurantId_sku_key" ON "retail_skus"("restaurantId", "sku");
CREATE UNIQUE INDEX "retail_skus_restaurantId_barcode_key" ON "retail_skus"("restaurantId", "barcode");
CREATE INDEX "retail_skus_productId_idx" ON "retail_skus"("productId");
CREATE INDEX "retail_skus_restaurantId_isActive_idx" ON "retail_skus"("restaurantId", "isActive");
CREATE UNIQUE INDEX "retail_stock_by_location_locationId_skuId_key" ON "retail_stock_by_location"("locationId", "skuId");
CREATE INDEX "retail_stock_by_location_restaurantId_locationId_idx" ON "retail_stock_by_location"("restaurantId", "locationId");
CREATE INDEX "retail_stock_by_location_skuId_idx" ON "retail_stock_by_location"("skuId");
CREATE INDEX "retail_stock_movements_restaurantId_createdAt_idx" ON "retail_stock_movements"("restaurantId", "createdAt");
CREATE INDEX "retail_stock_movements_locationId_createdAt_idx" ON "retail_stock_movements"("locationId", "createdAt");
CREATE INDEX "retail_stock_movements_skuId_createdAt_idx" ON "retail_stock_movements"("skuId", "createdAt");
CREATE INDEX "retail_stock_movements_refType_refId_idx" ON "retail_stock_movements"("refType", "refId");
CREATE UNIQUE INDEX "retail_devices_restaurantId_deviceKey_key" ON "retail_devices"("restaurantId", "deviceKey");
CREATE INDEX "retail_devices_restaurantId_locationId_idx" ON "retail_devices"("restaurantId", "locationId");
CREATE UNIQUE INDEX "retail_sales_restaurantId_clientSaleId_key" ON "retail_sales"("restaurantId", "clientSaleId");
CREATE UNIQUE INDEX "retail_sales_locationId_folio_key" ON "retail_sales"("locationId", "folio");
CREATE INDEX "retail_sales_restaurantId_createdAt_idx" ON "retail_sales"("restaurantId", "createdAt");
CREATE INDEX "retail_sales_locationId_createdAt_idx" ON "retail_sales"("locationId", "createdAt");
CREATE INDEX "retail_sale_lines_saleId_idx" ON "retail_sale_lines"("saleId");
CREATE INDEX "retail_sale_lines_skuId_idx" ON "retail_sale_lines"("skuId");
CREATE INDEX "retail_payments_saleId_idx" ON "retail_payments"("saleId");
CREATE INDEX "retail_transfers_restaurantId_createdAt_idx" ON "retail_transfers"("restaurantId", "createdAt");
CREATE INDEX "retail_transfers_fromLocationId_idx" ON "retail_transfers"("fromLocationId");
CREATE INDEX "retail_transfer_items_transferId_idx" ON "retail_transfer_items"("transferId");
CREATE INDEX "retail_transfer_items_skuId_idx" ON "retail_transfer_items"("skuId");
CREATE INDEX "retail_transfer_items_toLocationId_idx" ON "retail_transfer_items"("toLocationId");
CREATE UNIQUE INDEX "retail_sync_outbox_restaurantId_clientEventId_key" ON "retail_sync_outbox"("restaurantId", "clientEventId");
CREATE INDEX "retail_sync_outbox_restaurantId_status_createdAt_idx" ON "retail_sync_outbox"("restaurantId", "status", "createdAt");
CREATE INDEX "retail_sync_outbox_deviceId_createdAt_idx" ON "retail_sync_outbox"("deviceId", "createdAt");

ALTER TABLE "retail_products" ADD CONSTRAINT "retail_products_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_skus" ADD CONSTRAINT "retail_skus_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_skus" ADD CONSTRAINT "retail_skus_productId_fkey" FOREIGN KEY ("productId") REFERENCES "retail_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_stock_by_location" ADD CONSTRAINT "retail_stock_by_location_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_stock_by_location" ADD CONSTRAINT "retail_stock_by_location_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_stock_by_location" ADD CONSTRAINT "retail_stock_by_location_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "retail_skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_stock_movements" ADD CONSTRAINT "retail_stock_movements_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_stock_movements" ADD CONSTRAINT "retail_stock_movements_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_stock_movements" ADD CONSTRAINT "retail_stock_movements_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "retail_skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retail_devices" ADD CONSTRAINT "retail_devices_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_devices" ADD CONSTRAINT "retail_devices_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "retail_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "retail_sale_lines" ADD CONSTRAINT "retail_sale_lines_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "retail_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_sale_lines" ADD CONSTRAINT "retail_sale_lines_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "retail_skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retail_payments" ADD CONSTRAINT "retail_payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "retail_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_transfers" ADD CONSTRAINT "retail_transfers_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_transfers" ADD CONSTRAINT "retail_transfers_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_transfer_items" ADD CONSTRAINT "retail_transfer_items_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "retail_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_transfer_items" ADD CONSTRAINT "retail_transfer_items_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "retail_skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "retail_transfer_items" ADD CONSTRAINT "retail_transfer_items_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_sync_outbox" ADD CONSTRAINT "retail_sync_outbox_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_sync_outbox" ADD CONSTRAINT "retail_sync_outbox_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "retail_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
