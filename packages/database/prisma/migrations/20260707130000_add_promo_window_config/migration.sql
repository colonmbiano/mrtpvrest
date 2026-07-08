-- Ventana horaria diaria de los precios promocionales de platillos
-- (isPromo/promoPrice). "HH:mm" hora local (RestaurantConfig.timezone).
-- promoEndTime '21:00' = las promos terminan a las 9 pm.
ALTER TABLE "restaurant_config" ADD COLUMN "promoStartTime" TEXT;
ALTER TABLE "restaurant_config" ADD COLUMN "promoEndTime" TEXT;
