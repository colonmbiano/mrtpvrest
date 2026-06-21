-- Verificación de cobro por TRANSFERENCIA en entregas de repartidor.
-- El admin confirma contra el banco que el SPEI de un pedido cobrado por
-- transferencia realmente llegó. Espeja el patrón de cashCollected/At/By.
-- Aditiva (columnas nuevas con default), no toca datos existentes.
ALTER TABLE "orders" ADD COLUMN "transferVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "transferVerifiedAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "transferVerifiedBy" TEXT;
