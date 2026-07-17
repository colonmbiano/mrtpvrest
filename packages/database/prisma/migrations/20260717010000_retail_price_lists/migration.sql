-- Retail multigiro · listas de precio por tipo de cliente (Público / Contratista
-- / Mayoreo). Sale del guion de demo de ferretería: el catálogo real trae precio
-- público y de contratista para CADA producto, y la venta se cotiza según quién
-- compra.
--
-- Ortogonal a retail_price_tiers: la lista depende de QUIÉN compra, el escalón de
-- CUÁNTO lleva. Cuando ambos aplican gana el más barato (ver priceFor en
-- retail.routes.js y su espejo unitPriceFor en moda/lib/retail.ts).
--
-- ADITIVO: tablas nuevas + una columna nullable. Ningún tenant existente cambia
-- de comportamiento — sin listas, el precio sigue siendo RetailSku.price.
--
-- RLS al final: toda tabla creada aquí nace con RLS APAGADO y el resto del
-- esquema corre con RLS on + 0 políticas = deny-all (acceso solo backend/Prisma).
-- Olvidarlo dejaría los precios ESCRIBIBLES con la anon key, que es pública por
-- diseño — y el backend cotiza leyendo estas tablas. Ya pasó una vez con
-- retail_price_tiers (ver 20260716140000_retail_multigiro_enable_rls).

CREATE TABLE IF NOT EXISTS "retail_price_lists" (
  "id"           TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "isDefault"    BOOLEAN NOT NULL DEFAULT false,
  "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "retail_price_lists_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "retail_price_lists_restaurantId_name_key" ON "retail_price_lists"("restaurantId", "name");
CREATE INDEX IF NOT EXISTS "retail_price_lists_restaurantId_idx" ON "retail_price_lists"("restaurantId");

CREATE TABLE IF NOT EXISTS "retail_price_list_items" (
  "id"           TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "priceListId"  TEXT NOT NULL,
  "skuId"        TEXT NOT NULL,
  -- Decimal, nunca Float ni @db.Money (regla del CLAUDE.md).
  "price"        DECIMAL(12,2) NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "retail_price_list_items_pkey" PRIMARY KEY ("id")
);

-- Un precio por (lista, sku): dos filas harían la resolución dependiente del
-- orden de inserción.
CREATE UNIQUE INDEX IF NOT EXISTS "retail_price_list_items_priceListId_skuId_key" ON "retail_price_list_items"("priceListId", "skuId");
CREATE INDEX IF NOT EXISTS "retail_price_list_items_restaurantId_idx" ON "retail_price_list_items"("restaurantId");
CREATE INDEX IF NOT EXISTS "retail_price_list_items_skuId_idx" ON "retail_price_list_items"("skuId");

-- Con qué lista se cobró la venta. Nullable: las ventas ya existentes no tenían
-- lista, y una venta a precio de catálogo tampoco necesita una.
ALTER TABLE "retail_sales" ADD COLUMN IF NOT EXISTS "priceListId" TEXT;
CREATE INDEX IF NOT EXISTS "retail_sales_priceListId_idx" ON "retail_sales"("priceListId");

-- ─────────────────────────────────────────────────────────────────────────────
-- Foreign keys
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "retail_price_lists" DROP CONSTRAINT IF EXISTS "retail_price_lists_restaurantId_fkey";
ALTER TABLE "retail_price_lists" ADD CONSTRAINT "retail_price_lists_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "retail_price_list_items" DROP CONSTRAINT IF EXISTS "retail_price_list_items_restaurantId_fkey";
ALTER TABLE "retail_price_list_items" ADD CONSTRAINT "retail_price_list_items_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_price_list_items" DROP CONSTRAINT IF EXISTS "retail_price_list_items_priceListId_fkey";
ALTER TABLE "retail_price_list_items" ADD CONSTRAINT "retail_price_list_items_priceListId_fkey"
  FOREIGN KEY ("priceListId") REFERENCES "retail_price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_price_list_items" DROP CONSTRAINT IF EXISTS "retail_price_list_items_skuId_fkey";
ALTER TABLE "retail_price_list_items" ADD CONSTRAINT "retail_price_list_items_skuId_fkey"
  FOREIGN KEY ("skuId") REFERENCES "retail_skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull, no Cascade: borrar una lista de precios NO debe borrar el histórico
-- de ventas que se cobraron con ella.
ALTER TABLE "retail_sales" DROP CONSTRAINT IF EXISTS "retail_sales_priceListId_fkey";
ALTER TABLE "retail_sales" ADD CONSTRAINT "retail_sales_priceListId_fkey"
  FOREIGN KEY ("priceListId") REFERENCES "retail_price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: on + sin políticas = deny-all a PostgREST. Prisma (dueño) no pasa por RLS.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "retail_price_lists"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "retail_price_list_items" ENABLE ROW LEVEL SECURITY;
