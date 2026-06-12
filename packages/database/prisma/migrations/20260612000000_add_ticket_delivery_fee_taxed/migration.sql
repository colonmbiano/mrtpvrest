-- Envío (DELIVERY): ¿el costo de envío causa IVA?
-- Aditivo, NOT NULL con default true: seguro para producción, no cambia el
-- comportamiento de las filas existentes (envío con IVA incluido, como hasta hoy).
-- Cuando es false, el recibo excluye el envío de la base gravable del desglose
-- de IVA incluido. Configurable desde /admin/tickets.
ALTER TABLE "TicketConfig" ADD COLUMN IF NOT EXISTS "deliveryFeeTaxed" BOOLEAN NOT NULL DEFAULT true;
