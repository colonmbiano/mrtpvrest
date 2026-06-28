-- REEMBOLSO de tickets ya cobrados (total o parcial). Migración ADITIVA: agrega
-- dos columnas a "orders". NO toca columnas calientes ni hace backfill. Estilo
-- defensivo (IF NOT EXISTS) para aplicación manual segura a producción (Railway
-- NO aplica migraciones — se corre `migrate deploy` a mano, coordinado con el
-- deploy del backend).
--
-- refundedAmount · acumulado devuelto de la orden (default 0). Es el contador
-- que respalda el guard atómico anti-doble-reembolso (updateMany condicional
-- `refundedAmount <= total - monto`). Al llegar a `total`, la app pone
-- paymentStatus = 'REFUNDED'. El asiento de caja del reembolso NO vive aquí: el
-- efectivo que sale del cajón se registra como shift_expenses (categoría REFUND)
-- y el de un repartidor como driver_cash_movements EXPENSE.
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "refundedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3);
