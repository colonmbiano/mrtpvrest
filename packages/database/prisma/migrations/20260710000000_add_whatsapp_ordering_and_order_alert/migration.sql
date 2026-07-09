-- Reconciliación: master agregó `whatsappOrderingEnabled` al schema sin migración
-- (drift). Esta migración lo agrega de forma IDEMPOTENTE (por si prod ya lo tiene
-- vía db push) junto con el aviso al dueño de nuevos pedidos web. Todo aditivo y
-- seguro (apagado por default; número opcional que cae a RestaurantConfig.phone).
ALTER TABLE "restaurant_config" ADD COLUMN IF NOT EXISTS "whatsappOrderingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "restaurant_config" ADD COLUMN IF NOT EXISTS "orderAlertEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "restaurant_config" ADD COLUMN IF NOT EXISTS "orderAlertWhatsapp" TEXT;
