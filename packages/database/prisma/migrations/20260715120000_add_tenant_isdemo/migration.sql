-- Cuentas DEMO creadas desde el panel SaaS (pantalla /demos): tenants reales y
-- funcionales que se etiquetan para filtrarlas fuera de las métricas de clientes
-- y poder purgarlas al vencer. Cambio aditivo con defaults → seguro para
-- producción (ninguna fila existente cambia de comportamiento: isDemo = false).
--
-- IF NOT EXISTS: esta migración se aplicó a prod directamente vía Supabase MCP
-- (registrada a mano en _prisma_migrations); los guards la hacen re-ejecutable
-- sin fallar si `prisma migrate deploy` la vuelve a tocar en otro entorno.

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "demoExpiresAt" TIMESTAMP(3);

-- Índice parcial: las vistas de demos filtran por isDemo = true (pocas filas
-- frente al total de tenants), así el listado del panel no hace scan completo.
CREATE INDEX IF NOT EXISTS "tenants_isDemo_idx" ON "tenants" ("isDemo") WHERE "isDemo" = true;
