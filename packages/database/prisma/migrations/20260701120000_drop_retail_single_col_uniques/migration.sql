-- Reconciliación de drift retail (2026-06-20): prod conserva los índices únicos
-- de columna simple de la versión vieja de 20260618090000 (los compuestos con
-- restaurantId se crearon a mano encima, sin DROP). El schema solo declara los
-- compuestos; los simples además bloquean el mismo deviceKey/clientSaleId/
-- clientEventId entre tenants distintos. IF EXISTS: en una BD fresca no existen.
DROP INDEX IF EXISTS "retail_devices_deviceKey_key";
DROP INDEX IF EXISTS "retail_sales_clientSaleId_key";
DROP INDEX IF EXISTS "retail_sync_outbox_clientEventId_key";
