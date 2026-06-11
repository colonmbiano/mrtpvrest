-- Tipografía configurable del ticket (recibo y comanda) desde /admin/tickets.
-- Aditivo, NOT NULL con default: seguro para producción, no afecta filas previas.
-- Recibo: lineSpacing (interlineado) + lineWeight (negritas). La fuente reusa
-- fontFamily y el tamaño reusa fontSize, que ya existían.
ALTER TABLE "TicketConfig" ADD COLUMN IF NOT EXISTS "lineSpacing" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "TicketConfig" ADD COLUMN IF NOT EXISTS "lineWeight" TEXT NOT NULL DEFAULT 'normal';

-- Comanda: fuente + interlineado + negritas (el tamaño reusa kitchenFontSize).
ALTER TABLE "TicketConfig" ADD COLUMN IF NOT EXISTS "kitchenFontFamily" TEXT NOT NULL DEFAULT 'monospace';
ALTER TABLE "TicketConfig" ADD COLUMN IF NOT EXISTS "kitchenLineSpacing" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "TicketConfig" ADD COLUMN IF NOT EXISTS "kitchenLineWeight" TEXT NOT NULL DEFAULT 'bold';

-- Tamaño del nombre del ticket (Mesa/cliente) en la comanda — elemento principal.
ALTER TABLE "TicketConfig" ADD COLUMN IF NOT EXISTS "kitchenTicketNameSize" TEXT NOT NULL DEFAULT 'large';
