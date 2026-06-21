-- Promociones por cantidad (NxM, p.ej. "3x2 alitas"). Ver schema model BulkPromo
-- + lib/bulk-promo.js. El descuento se persiste APARTE en orders.promoDiscount
-- para distinguir "promo del negocio" del descuento manual del cajero.

-- AlterTable: descuento automático por promo (separado del discount manual).
ALTER TABLE "orders" ADD COLUMN "promoDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable: definición de la promo NxM.
CREATE TABLE "bulk_promos" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "buyQuantity" INTEGER NOT NULL DEFAULT 3,
    "payQuantity" INTEGER NOT NULL DEFAULT 2,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulk_promos_pkey" PRIMARY KEY ("id")
);

-- CreateTable: pool de categorías elegibles (join explícito).
CREATE TABLE "bulk_promo_categories" (
    "bulkPromoId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "bulk_promo_categories_pkey" PRIMARY KEY ("bulkPromoId","categoryId")
);

-- CreateIndex
CREATE INDEX "bulk_promos_restaurantId_isActive_idx" ON "bulk_promos"("restaurantId", "isActive");

-- CreateIndex
CREATE INDEX "bulk_promo_categories_categoryId_idx" ON "bulk_promo_categories"("categoryId");

-- AddForeignKey
ALTER TABLE "bulk_promos" ADD CONSTRAINT "bulk_promos_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_promo_categories" ADD CONSTRAINT "bulk_promo_categories_bulkPromoId_fkey" FOREIGN KEY ("bulkPromoId") REFERENCES "bulk_promos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_promo_categories" ADD CONSTRAINT "bulk_promo_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
