-- Envío por distancia + coordenadas de entrega.
-- Todas las columnas son aditivas (NULL o con DEFAULT), seguras para producción.

-- RestaurantConfig: parámetros de envío por distancia
ALTER TABLE "restaurant_config"
  ADD COLUMN "deliveryMode" TEXT NOT NULL DEFAULT 'FLAT',
  ADD COLUMN "originLat" DOUBLE PRECISION,
  ADD COLUMN "originLng" DOUBLE PRECISION,
  ADD COLUMN "deliveryBaseFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryPerKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryFreeRadiusKm" DOUBLE PRECISION,
  ADD COLUMN "deliveryMaxKm" DOUBLE PRECISION;

-- Order: coordenadas del cliente y distancia calculada
ALTER TABLE "orders"
  ADD COLUMN "deliveryLat" DOUBLE PRECISION,
  ADD COLUMN "deliveryLng" DOUBLE PRECISION,
  ADD COLUMN "deliveryDistanceKm" DOUBLE PRECISION;
