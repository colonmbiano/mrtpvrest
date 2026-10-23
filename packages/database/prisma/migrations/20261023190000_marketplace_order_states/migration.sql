-- Additive only. Prepared offline for MKT-104; not applied by this task.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PENDING_MERCHANT';
