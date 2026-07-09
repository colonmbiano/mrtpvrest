-- Moneda configurable de la tienda (antes "$"/es-MX hardcodeado en el storefront).
-- Columnas nuevas con default: aditivas y seguras para producción; el backfill
-- del default conserva el comportamiento actual (pesos mexicanos).

ALTER TABLE "restaurant_config" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'MXN';
ALTER TABLE "restaurant_config" ADD COLUMN "currencyLocale" TEXT NOT NULL DEFAULT 'es-MX';
