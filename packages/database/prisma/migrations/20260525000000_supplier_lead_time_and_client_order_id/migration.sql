-- Suggested PO inputs en Supplier
ALTER TABLE "Supplier"
    ADD COLUMN "leadTimeDays" INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN "minOrderAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Idempotencia DB-level para replays offline
ALTER TABLE "orders"
    ADD COLUMN "clientOrderId" TEXT;

CREATE UNIQUE INDEX "orders_clientOrderId_key"
    ON "orders"("clientOrderId");
