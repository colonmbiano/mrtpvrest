-- Estado "En empaque". ADD VALUE al final del enum (Postgres 12+ permite
-- ALTER TYPE ADD VALUE en migración mientras el valor no se use en la misma tx).
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PACKING';
