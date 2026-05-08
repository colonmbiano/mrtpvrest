-- Commit B — Printer Groups (modelo Loyverse).
-- Un grupo agrupa N impresoras + N categorías. Items se enrutan al
-- group de su categoría o al override del item. Multi-grupo: el mismo
-- item puede ir a varios groups simultáneo.

-- 1. Grupo principal.
CREATE TABLE "printer_groups" (
  "id" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "printer_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "printer_groups_locationId_name_key" ON "printer_groups"("locationId", "name");
CREATE INDEX "printer_groups_locationId_idx" ON "printer_groups"("locationId");

ALTER TABLE "printer_groups" ADD CONSTRAINT "printer_groups_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Membership Printer ↔ PrinterGroup.
CREATE TABLE "printer_group_members" (
  "id" TEXT NOT NULL,
  "printerGroupId" TEXT NOT NULL,
  "printerId" TEXT NOT NULL,
  CONSTRAINT "printer_group_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "printer_group_members_printerGroupId_printerId_key"
  ON "printer_group_members"("printerGroupId", "printerId");
CREATE INDEX "printer_group_members_printerId_idx" ON "printer_group_members"("printerId");

ALTER TABLE "printer_group_members" ADD CONSTRAINT "printer_group_members_printerGroupId_fkey"
  FOREIGN KEY ("printerGroupId") REFERENCES "printer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "printer_group_members" ADD CONSTRAINT "printer_group_members_printerId_fkey"
  FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Default route por Categoría.
CREATE TABLE "category_printer_groups" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "printerGroupId" TEXT NOT NULL,
  CONSTRAINT "category_printer_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "category_printer_groups_categoryId_printerGroupId_key"
  ON "category_printer_groups"("categoryId", "printerGroupId");
CREATE INDEX "category_printer_groups_printerGroupId_idx" ON "category_printer_groups"("printerGroupId");

ALTER TABLE "category_printer_groups" ADD CONSTRAINT "category_printer_groups_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "category_printer_groups" ADD CONSTRAINT "category_printer_groups_printerGroupId_fkey"
  FOREIGN KEY ("printerGroupId") REFERENCES "printer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Override por Item (gana sobre la categoría si está definido).
CREATE TABLE "menu_item_printer_groups" (
  "id" TEXT NOT NULL,
  "menuItemId" TEXT NOT NULL,
  "printerGroupId" TEXT NOT NULL,
  CONSTRAINT "menu_item_printer_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "menu_item_printer_groups_menuItemId_printerGroupId_key"
  ON "menu_item_printer_groups"("menuItemId", "printerGroupId");
CREATE INDEX "menu_item_printer_groups_printerGroupId_idx" ON "menu_item_printer_groups"("printerGroupId");

ALTER TABLE "menu_item_printer_groups" ADD CONSTRAINT "menu_item_printer_groups_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menu_item_printer_groups" ADD CONSTRAINT "menu_item_printer_groups_printerGroupId_fkey"
  FOREIGN KEY ("printerGroupId") REFERENCES "printer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
