-- Venta por unidad de medida + cobro por peso (docs/venta-por-peso-prompts.md).
-- unit ∈ {pz, unidad, g, kg}; g/kg son pesables (cantidad decimal).
--
-- order_items.quantity Int -> Float: ALTER COLUMN ... TYPE DOUBLE PRECISION es un
-- ensanchamiento sin pérdida (todo entero existente cabe exacto en double).

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'pz';

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'pz',
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;
