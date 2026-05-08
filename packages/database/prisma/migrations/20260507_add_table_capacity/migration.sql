-- AlterTable: agrega capacity (comensales) a Table.
-- Default 4 = mesa estándar; las mesas existentes lo heredan.
ALTER TABLE "tables" ADD COLUMN "capacity" INTEGER NOT NULL DEFAULT 4;
