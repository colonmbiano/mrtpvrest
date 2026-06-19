-- Venta por peso (báscula). Aditiva y segura: dos columnas nuevas con
-- default/nullable, sin backfill ni cambio de tipo en columnas calientes.
--
-- menu_items.soldByWeight  → el producto se vende por kg; `price`/`promoPrice`
--                            se interpretan como PRECIO POR KG.
-- order_items.weightKg     → kg vendidos en esa línea (Decimal(10,3)). Cuando
--                            está presente, quantity=1 y subtotal = price × kg.
--                            NULL para los productos por pieza (la mayoría).

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN "soldByWeight" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "weightKg" DECIMAL(10,3);
