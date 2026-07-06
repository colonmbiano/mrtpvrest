-- Freno de saturación: tope de pedidos abiertos a partir del cual la tienda
-- online y el bot de WhatsApp dejan de aceptar pedidos (429 STORE_SATURATED).
-- Ambas columnas nullable → cambio backward-compatible (se puede aplicar antes
-- del deploy del backend sin romper la versión corriendo).
ALTER TABLE "restaurant_config" ADD COLUMN "maxOpenOrders" INTEGER;
ALTER TABLE "restaurant_config" ADD COLUMN "saturatedMessage" TEXT;
