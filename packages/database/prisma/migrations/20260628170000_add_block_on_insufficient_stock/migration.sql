-- Bloqueo preventivo de venta sin stock suficiente (opt-in por tenant). Default
-- false = comportamiento legacy intacto (descuento best-effort post-cobro).
ALTER TABLE "restaurant_config" ADD COLUMN "blockOnInsufficientStock" BOOLEAN NOT NULL DEFAULT false;
