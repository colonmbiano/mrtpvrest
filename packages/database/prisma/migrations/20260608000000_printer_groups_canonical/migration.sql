-- Printer Groups como fuente única de enrutamiento de comandas.
--
-- Hasta ahora el ruteo categoría → impresora vivía en DOS sitios:
--   1. PrinterGroup / CategoryPrinterGroup / MenuItemPrinterGroup (moderno).
--   2. Printer.categories[] (legacy) — un array de categoryIds en la propia
--      impresora, editable desde el modal "Asignar categorías".
-- El dispatcher de impresión del TPV ya enrutaba solo por PrinterGroups; el
-- array legacy únicamente alimentaba el filtro de lectura del KDS, lo que
-- generaba reglas redundantes y precedencia ambigua.
--
-- Esta migración:
--   (A) Backfill: por cada impresora con categories[] legacy, crea/reutiliza
--       un PrinterGroup "Auto: <nombre>" con esa impresora como miembro y sus
--       categorías asignadas, preservando el comportamiento del KDS.
--   (B) Elimina la columna Printer.categories.

-- (A) Backfill ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  p     RECORD;
  grpId TEXT;
  catId TEXT;
BEGIN
  FOR p IN
    SELECT id, "locationId", name, categories
    FROM "Printer"
    WHERE "locationId" IS NOT NULL
      AND categories IS NOT NULL
      AND array_length(categories, 1) > 0
  LOOP
    -- Find-or-create del grupo automático para esta impresora.
    SELECT id INTO grpId
    FROM "printer_groups"
    WHERE "locationId" = p."locationId" AND name = 'Auto: ' || p.name
    LIMIT 1;

    IF grpId IS NULL THEN
      grpId := gen_random_uuid()::text;
      INSERT INTO "printer_groups" (id, "locationId", name, "createdAt", "updatedAt")
      VALUES (grpId, p."locationId", 'Auto: ' || p.name, now(), now());
    END IF;

    -- Asegurar membresía de la impresora en su grupo automático.
    INSERT INTO "printer_group_members" (id, "printerGroupId", "printerId")
    SELECT gen_random_uuid()::text, grpId, p.id
    WHERE NOT EXISTS (
      SELECT 1 FROM "printer_group_members"
      WHERE "printerGroupId" = grpId AND "printerId" = p.id
    );

    -- Enlazar cada categoría legacy que aún exista (evita FK rota).
    FOREACH catId IN ARRAY p.categories
    LOOP
      IF EXISTS (SELECT 1 FROM "categories" WHERE id = catId) THEN
        INSERT INTO "category_printer_groups" (id, "categoryId", "printerGroupId")
        SELECT gen_random_uuid()::text, catId, grpId
        WHERE NOT EXISTS (
          SELECT 1 FROM "category_printer_groups"
          WHERE "categoryId" = catId AND "printerGroupId" = grpId
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- (B) Drop columna legacy ──────────────────────────────────────────────────────
ALTER TABLE "Printer" DROP COLUMN "categories";
