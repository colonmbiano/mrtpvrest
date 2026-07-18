-- Ventana horaria POR PRODUCTO para promos: override de la ventana global del
-- restaurante (restaurant_config.promoStartTime/promoEndTime). Ambas columnas
-- nulables ("HH:mm", hora local del restaurante). NULL en ambas => el item
-- hereda la ventana global (comportamiento histórico, sin cambios).
ALTER TABLE "menu_items" ADD COLUMN "promoStartTime" TEXT;
ALTER TABLE "menu_items" ADD COLUMN "promoEndTime" TEXT;
