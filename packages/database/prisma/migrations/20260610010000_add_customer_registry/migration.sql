-- Directorio de clientes por teléfono (registro multi-tenant) + enlace desde orders.
-- El teléfono normalizado (solo dígitos) es la llave única por restaurante; el TPV
-- busca por él para autocompletar nombre/dirección al meter un pedido.

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "address" TEXT,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastOrderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_restaurantId_phone_idx" ON "customers"("restaurantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "customers_restaurantId_phone_key" ON "customers"("restaurantId", "phone");

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "customerId" TEXT;

-- CreateIndex
CREATE INDEX "orders_customerId_idx" ON "orders"("customerId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
