-- AlterTable
-- Fondo de cambio (caja chica) del repartidor. El admin se lo asigna al iniciar
-- turno para dar cambio en cobros en efectivo y cubrir compras. Se registra como
-- un DriverCashMovement type='FLOAT' (no infla "cobrado"); aquí guardamos el total
-- en el corte. Idempotente: el deploy de Railway sólo corre `prisma generate`, la
-- columna se aplica manualmente a producción (Supabase).
ALTER TABLE "DriverCashCut" ADD COLUMN IF NOT EXISTS "totalFloat" DOUBLE PRECISION NOT NULL DEFAULT 0;
