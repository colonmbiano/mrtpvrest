-- Existing rows remain global. Do not seed product recipes until all backend
-- workers run the scoped resolver; old workers match only restaurant + name.
ALTER TABLE "modifier_ingredients" ADD COLUMN "menuItemId" TEXT;
CREATE INDEX "modifier_ingredients_restaurantId_menuItemId_name_idx"
  ON "modifier_ingredients"("restaurantId", "menuItemId", "name");
ALTER TABLE "modifier_ingredients"
  ADD CONSTRAINT "modifier_ingredients_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
