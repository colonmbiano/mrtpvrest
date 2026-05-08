-- Commit A — Favoritos.
-- isFavorite: items que el admin destaca para mostrar en un tile pinned
-- "★ Favoritos" arriba del grid de categorías del POS.
ALTER TABLE "menu_items" ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "menu_items_restaurantId_isFavorite_idx" ON "menu_items"("restaurantId", "isFavorite");
