-- Receta por variante de platillo: permite hasta una receta por (menuItem, variant)
-- además de la receta base (variantId NULL). Habilita escandallos distintos por
-- proteína (p.ej. Alambre 350gr Arrachera/Pollo/Res y Cerdo).

-- DropIndex
DROP INDEX "recipes_menuItemId_key";

-- AlterTable
ALTER TABLE "recipes" ADD COLUMN "variantId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "recipes_menuItemId_variantId_key" ON "recipes"("menuItemId", "variantId");

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "MenuItemVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
