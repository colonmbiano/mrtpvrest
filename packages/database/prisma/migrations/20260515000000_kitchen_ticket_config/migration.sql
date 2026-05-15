-- AlterTable
ALTER TABLE "TicketConfig"
  ADD COLUMN "kitchenShowOrderNumber" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "kitchenShowModifiers"   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "kitchenShowNotes"       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "kitchenGroupBySeat"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "kitchenFontSize"        TEXT    NOT NULL DEFAULT 'large',
  ADD COLUMN "kitchenFooter"          TEXT    NOT NULL DEFAULT '';

-- Normaliza el header legacy a "COMANDA" para que coincida con el render
-- por defecto del builder. Los configs ya editados a mano se respetan.
UPDATE "TicketConfig"
   SET "kitchenHeader" = 'COMANDA'
 WHERE "kitchenHeader" = '*** COCINA ***';

-- Cambia el default de la columna para nuevos registros.
ALTER TABLE "TicketConfig"
  ALTER COLUMN "kitchenHeader" SET DEFAULT 'COMANDA';
