-- El esquema y las consultas del menú ya usan estas columnas. Incluirlas en
-- las migraciones permite reconstruir la BD (incluido E2E) sin db push.
-- IF NOT EXISTS conserva instalaciones donde los campos ya fueron creados.
ALTER TABLE "modifiers"
  ADD COLUMN IF NOT EXISTS "isKitchenNote" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MenuItemComplement"
  ADD COLUMN IF NOT EXISTS "isKitchenNote" BOOLEAN NOT NULL DEFAULT false;
