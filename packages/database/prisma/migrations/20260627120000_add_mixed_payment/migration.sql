-- COBRO MIXTO (split-tender) · una orden pagada con varios métodos a la vez
-- (p.ej. parte en efectivo + parte en tarjeta). Migración ADITIVA mínima: solo
-- agrega el valor de enum 'MIXED'. NO crea tablas — los renglones de cada pago
-- se guardan en la tabla `payment_transactions` que YA existe (baseline) y hasta
-- hoy estaba dormida. NO toca columnas calientes ni hace backfill.
--
-- Aplicación manual a producción (Railway NO aplica migraciones — se corre
-- `migrate deploy` a mano coordinado con el deploy del backend).
--
-- Modelo: cuando una orden se cobra con >1 método, Order.paymentMethod queda en
-- 'MIXED' y se crea un payment_transactions por cada método con su monto. El
-- corte de caja suma cada renglón a su bucket (efectivo/tarjeta/transfer), así
-- la porción en efectivo de un pago mixto entra correcto al efectivo esperado.

-- ADD VALUE IF NOT EXISTS es idempotente y, como NO usamos el valor en esta
-- misma migración, corre sin problema dentro de la transacción (PG12+).
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'MIXED';
