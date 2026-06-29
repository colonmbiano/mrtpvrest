-- Visibilidad por canal: separa el kiosko de la web (antes ambos usaban
-- availableOnline). Backfill = availableOnline para NO reintroducir en el kiosko
-- productos que el operador ya tenía ocultos en línea.
ALTER TABLE "menu_items" ADD COLUMN "availableOnKiosk" BOOLEAN NOT NULL DEFAULT true;
UPDATE "menu_items" SET "availableOnKiosk" = "availableOnline";
