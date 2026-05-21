-- AlterTable
ALTER TABLE "menu_items"
  ADD COLUMN "variantMultiSelect"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "variantMinSelection" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "variantMaxSelection" INTEGER NOT NULL DEFAULT 0;
