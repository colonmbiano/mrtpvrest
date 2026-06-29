-- Combos configurables: MenuItem.isCombo + componentes/opciones + selección snapshot.
ALTER TABLE "menu_items" ADD COLUMN "isCombo" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "combo_components" (
  "id"         TEXT NOT NULL,
  "menuItemId" TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "minSelect"  INTEGER NOT NULL DEFAULT 1,
  "maxSelect"  INTEGER NOT NULL DEFAULT 1,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "combo_components_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "combo_components_menuItemId_idx" ON "combo_components"("menuItemId");

CREATE TABLE "combo_options" (
  "id"               TEXT NOT NULL,
  "componentId"      TEXT NOT NULL,
  "optionMenuItemId" TEXT NOT NULL,
  "priceDelta"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "isAvailable"      BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"        INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "combo_options_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "combo_options_componentId_idx" ON "combo_options"("componentId");

CREATE TABLE "combo_selections" (
  "id"               TEXT NOT NULL,
  "orderItemId"      TEXT NOT NULL,
  "componentId"      TEXT,
  "optionId"         TEXT,
  "optionMenuItemId" TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "priceDelta"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  CONSTRAINT "combo_selections_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "combo_selections_orderItemId_idx" ON "combo_selections"("orderItemId");

ALTER TABLE "combo_components" ADD CONSTRAINT "combo_components_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "combo_options" ADD CONSTRAINT "combo_options_componentId_fkey"
  FOREIGN KEY ("componentId") REFERENCES "combo_components"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "combo_options" ADD CONSTRAINT "combo_options_optionMenuItemId_fkey"
  FOREIGN KEY ("optionMenuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "combo_selections" ADD CONSTRAINT "combo_selections_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
