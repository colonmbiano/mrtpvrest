-- Permite borrar un Modifier del menú aunque ya se haya usado en órdenes.
-- OrderItemModifier guarda name/priceAdd como snapshot, así que el historial
-- de la orden se conserva intacto; modifierId pasa a null (SetNull) en vez de
-- bloquear el borrado con Restrict.

-- AlterTable: modifierId pasa a opcional
ALTER TABLE "order_item_modifiers" ALTER COLUMN "modifierId" DROP NOT NULL;

-- DropForeignKey
ALTER TABLE "order_item_modifiers" DROP CONSTRAINT "order_item_modifiers_modifierId_fkey";

-- AddForeignKey
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "modifiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
