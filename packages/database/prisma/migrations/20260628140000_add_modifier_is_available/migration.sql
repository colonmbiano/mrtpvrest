-- Permite marcar un extra/modificador como agotado sin borrarlo ni perder su
-- mapeo de inventario (ModifierIngredient). Espejo de MenuItemVariant.isAvailable.
ALTER TABLE "modifiers" ADD COLUMN "isAvailable" BOOLEAN NOT NULL DEFAULT true;
