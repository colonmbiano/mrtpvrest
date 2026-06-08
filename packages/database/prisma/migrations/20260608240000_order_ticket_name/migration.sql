-- Etiqueta editable de la cuenta abierta (independiente de customerName/mesa).
ALTER TABLE "orders" ADD COLUMN "ticketName" TEXT;
