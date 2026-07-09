-- Zonas de entrega por polígono (RestaurantConfig.deliveryMode = ZONES).
-- Tabla nueva, aditiva y aislada: no toca tablas existentes, segura para producción.

CREATE TABLE "delivery_zones" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#22c55e',
    "polygon" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- Selección de zonas activas al cotizar el envío (orden por prioridad).
CREATE INDEX "delivery_zones_restaurantId_active_priority_idx" ON "delivery_zones"("restaurantId", "active", "priority");

-- Limpieza en cascada al borrar el restaurante.
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
