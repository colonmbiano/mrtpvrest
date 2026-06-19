-- Unidad de medida libre por producto de venta (etiqueta seleccionable:
-- pz, kg, g, L, ml, orden, bolsa, lata, caja, paquete, docena…). Es la unidad
-- que se muestra en POS/ticket; el comportamiento (peso vs conteo) lo sigue
-- dictando saleUnit/soldByWeight. Aditiva.

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'pz';

-- Backfill con una etiqueta coherente con la unidad de venta ya existente.
UPDATE "menu_items" SET "unit" = 'kg'    WHERE "saleUnit" = 'WEIGHT';
UPDATE "menu_items" SET "unit" = 'orden' WHERE "saleUnit" = 'ORDER';
