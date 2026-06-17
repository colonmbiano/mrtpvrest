-- Consumo de inventario por modificador (extras): mapea un modificador
-- (por NOMBRE, a nivel restaurante) a uno o más insumos/subrecetas, para que
-- al vender un platillo con ese extra (p.ej. "Papas Gajo Extra") se descuente
-- también su insumo. El descuento resuelve por nombre porque order_item_modifiers
-- guarda el nombre del modificador.

-- CreateTable
CREATE TABLE "modifier_ingredients" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ingredientId" TEXT,
    "subRecipeId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" "IngredientBaseUnit" NOT NULL DEFAULT 'GRAM',
    "wastagePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modifier_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "modifier_ingredients_restaurantId_name_idx" ON "modifier_ingredients"("restaurantId", "name");

-- AddForeignKey
ALTER TABLE "modifier_ingredients" ADD CONSTRAINT "modifier_ingredients_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_ingredients" ADD CONSTRAINT "modifier_ingredients_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_ingredients" ADD CONSTRAINT "modifier_ingredients_subRecipeId_fkey" FOREIGN KEY ("subRecipeId") REFERENCES "subrecipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
