-- C2: la tarea de pedidos del Mercadito sin aceptar consulta cada minuto por estado y canal.
-- Solo agrega un índice; compatible con la versión anterior del backend.
CREATE INDEX IF NOT EXISTS "orders_status_source_idx" ON "orders"("status", "source");
