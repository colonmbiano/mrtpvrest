-- Fase 1 SaaS: Feature Toggles y Storefront Config en el modelo Tenant.
-- Campos retrocompatibles: booleanos con DEFAULT false, campos opcionales con NULL.

-- SaaS Module Flags
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "hasInventory" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "hasDelivery"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "hasWebStore"  BOOLEAN NOT NULL DEFAULT false;

-- Storefront & Contact
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "whatsappNumber" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "themeConfig"    JSONB;
