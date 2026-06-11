-- Empleado del TPV que tomó/creó el pedido (Employee.id).
-- FK escalar sin relación Prisma, mismo patrón que deliveryDriverId.
-- Aditivo y nullable: seguro para producción, no afecta pedidos previos.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
CREATE INDEX IF NOT EXISTS "orders_createdById_idx" ON "orders" ("createdById");
