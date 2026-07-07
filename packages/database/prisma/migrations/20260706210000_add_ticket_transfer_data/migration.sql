-- Datos para pagar por TRANSFERENCIA en la cuenta pendiente de pago:
-- banco, titular y CLABE/cuenta, configurables desde el editor de tickets.
-- Aditivo, NOT NULL con default: seguro para producción (apagado por default,
-- las filas existentes no imprimen nada nuevo hasta que el negocio lo active).
ALTER TABLE "TicketConfig" ADD COLUMN IF NOT EXISTS "showTransferData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TicketConfig" ADD COLUMN IF NOT EXISTS "transferBank" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TicketConfig" ADD COLUMN IF NOT EXISTS "transferAccountName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TicketConfig" ADD COLUMN IF NOT EXISTS "transferAccountNumber" TEXT NOT NULL DEFAULT '';
