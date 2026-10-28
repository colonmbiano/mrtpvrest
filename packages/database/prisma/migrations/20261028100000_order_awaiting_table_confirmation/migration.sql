-- Pedidos de mesa desde internet (QR) por confirmar: la caja confirma que hay gente
-- en la mesa antes de que el pedido vaya a cocina u ocupe la mesa.
-- PostgreSQL 11+ agrega la columna con DEFAULT sin reescribir la tabla.
-- AlterTable
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "awaitingTableConfirmation" BOOLEAN NOT NULL DEFAULT false;
