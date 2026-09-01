-- AlterTable
ALTER TABLE "TicketConfig"
ADD COLUMN IF NOT EXISTS "kitchenInvertModifiers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "kitchenModifiersFontSize" TEXT NOT NULL DEFAULT 'normal',
ADD COLUMN IF NOT EXISTS "kitchenItemSeparator" BOOLEAN NOT NULL DEFAULT false;
