-- Horario de atención automático de la tienda.
-- Todas las columnas son aditivas (con DEFAULT), seguras para producción.

-- RestaurantConfig: interruptor de horario, zona horaria y franjas por día.
ALTER TABLE "restaurant_config"
  ADD COLUMN "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
  ADD COLUMN "businessHours" TEXT NOT NULL DEFAULT '[]';
