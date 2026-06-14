-- Opciones POR LÍNEA del recibo del cliente (editor de tickets /admin/tickets).
-- Aditivo, NOT NULL con default: seguro para producción, no afecta filas previas.
-- Controlan el "amontonamiento" y el detalle de cada línea de producto:
--   itemSpacing          aire entre productos ("loose" = línea en blanco)
--   showItemSeparator    línea punteada entre productos
--   modifierIndent       sangría de modificadores/notas ("none"|"normal"|"wide")
--   receiptShowModifiers  imprimir modificadores en el recibo
--   receiptShowNotes      imprimir notas del producto en el recibo (opt-in)
ALTER TABLE "TicketConfig" ADD COLUMN IF NOT EXISTS "itemSpacing" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "TicketConfig" ADD COLUMN IF NOT EXISTS "showItemSeparator" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TicketConfig" ADD COLUMN IF NOT EXISTS "modifierIndent" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "TicketConfig" ADD COLUMN IF NOT EXISTS "receiptShowModifiers" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TicketConfig" ADD COLUMN IF NOT EXISTS "receiptShowNotes" BOOLEAN NOT NULL DEFAULT false;
