-- Unidad de venta por artículo: PIECE (pieza, default) | WEIGHT (kilo) | ORDER
-- (orden/ración). Aditiva. soldByWeight queda como derivado sincronizado para
-- no tocar la lógica de cobro/inventario por peso ya desplegada.

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN "saleUnit" TEXT NOT NULL DEFAULT 'PIECE';

-- Backfill: los que ya estaban por peso pasan a saleUnit=WEIGHT.
UPDATE "menu_items" SET "saleUnit" = 'WEIGHT' WHERE "soldByWeight" = true;
