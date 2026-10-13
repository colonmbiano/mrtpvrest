-- Prisma schema already exposes these flags, but older databases (including
-- a clean CI database built only from migrations) do not have the columns.
-- Keep this migration additive and idempotent so deploys remain backward-compatible.

ALTER TABLE "modifiers"
  ADD COLUMN IF NOT EXISTS "isKitchenNote" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MenuItemComplement"
  ADD COLUMN IF NOT EXISTS "isKitchenNote" BOOLEAN NOT NULL DEFAULT false;
