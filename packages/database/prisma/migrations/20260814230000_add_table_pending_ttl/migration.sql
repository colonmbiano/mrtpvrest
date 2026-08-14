-- Barrido de mesas: minutos que un pedido del QR de mesa puede quedarse en
-- PENDING antes de que el cron lo cancele y libere la mesa.
--   NULL → usa el default global del backend (TABLE_PENDING_TTL_MIN, 180 min)
--   0    → barrido apagado para ese restaurante
-- Nullable y sin default, así que ningún tenant existente cambia de
-- comportamiento al aplicarla.
ALTER TABLE "restaurant_config" ADD COLUMN "tablePendingTtlMin" INTEGER;
