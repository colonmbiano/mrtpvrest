-- Etapa de empaque: flag por tenant + checklist por pedido.
ALTER TABLE "restaurant_config" ADD COLUMN "hasPackingStage" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "order_packing_checks" (
  "id"          TEXT NOT NULL,
  "orderId"     TEXT NOT NULL,
  "checkKey"    TEXT NOT NULL,
  "checked"     BOOLEAN NOT NULL DEFAULT false,
  "checkedAt"   TIMESTAMP(3),
  "checkedById" TEXT,
  CONSTRAINT "order_packing_checks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "order_packing_checks_orderId_checkKey_key" ON "order_packing_checks"("orderId", "checkKey");
CREATE INDEX "order_packing_checks_orderId_idx" ON "order_packing_checks"("orderId");
ALTER TABLE "order_packing_checks" ADD CONSTRAINT "order_packing_checks_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
