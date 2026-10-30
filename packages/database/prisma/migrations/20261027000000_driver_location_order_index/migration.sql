-- Seguimiento v1 (C5): el comprador consulta cada 15 s el primer y el último aviso GPS
-- del repartidor para SU pedido. Sin índice, cada consulta recorría toda la tabla.
-- IF NOT EXISTS conserva instalaciones donde el índice ya se creó a mano.
CREATE INDEX IF NOT EXISTS "DriverLocation_driverId_orderId_createdAt_idx" ON "DriverLocation"("driverId", "orderId", "createdAt");
