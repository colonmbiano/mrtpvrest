-- Imprimir la descripción del producto como sub-línea en la comanda de cocina.
-- Opt-in (default false). Pensado para combos: el nombre en botón/recibo queda
-- limpio y cocina ve el desglose ("qué lleva").
ALTER TABLE "TicketConfig" ADD COLUMN "kitchenShowItemDescription" BOOLEAN NOT NULL DEFAULT false;
