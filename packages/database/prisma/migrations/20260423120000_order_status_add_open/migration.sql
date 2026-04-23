-- Dine-in: agregar valor OPEN al enum OrderStatus para soportar cuentas abiertas.
-- Va en una migración separada de las tablas porque ALTER TYPE ADD VALUE en
-- PostgreSQL tiene restricciones al usarse dentro de la misma transacción en
-- que se referencia el valor nuevo. Al aislarla, el COMMIT posterior garantiza
-- que cualquier inserción/consulta con 'OPEN' en la siguiente migración ya
-- disponga del valor.

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'OPEN';
