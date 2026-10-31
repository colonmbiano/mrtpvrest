-- Additive migration: safe while the previous application version is running.
ALTER TABLE "menu_items" ADD COLUMN "isPackagingProduct" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "packagingPlan" JSONB;
