-- QR de lealtad al pie del recibo (editor de tickets /admin/tickets).
-- Aditivo, NOT NULL con default: seguro para producción, no afecta filas previas.
-- El cliente escanea el QR para registrarse en la tienda en línea y acumular
-- puntos. loyaltyUrl = destino del QR (tienda/registro).
ALTER TABLE "TicketConfig" ADD COLUMN IF NOT EXISTS "showLoyaltyQr" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TicketConfig" ADD COLUMN IF NOT EXISTS "loyaltyUrl" TEXT NOT NULL DEFAULT '';
