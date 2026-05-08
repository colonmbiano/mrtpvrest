-- Fase 2 — Comensales en orden DINE_IN.
-- - Order.numberOfGuests: cuántos comensales se sentaron al iniciar la cuenta.
-- - OrderItem.seatNumber:  a qué comensal pertenece cada ítem (1..N). NULL =
--   compartido por toda la mesa.

ALTER TABLE "orders"
  ADD COLUMN "numberOfGuests" INTEGER;

ALTER TABLE "order_items"
  ADD COLUMN "seatNumber" INTEGER;

CREATE INDEX "order_items_seatNumber_idx" ON "order_items"("seatNumber");
