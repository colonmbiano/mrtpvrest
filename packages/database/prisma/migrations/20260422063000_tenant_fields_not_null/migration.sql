-- Fase 2 C2: Back-fill y lock NOT NULL de los campos multi-tenant críticos.
-- Requisito PRD §13 Fase 2: Restaurant.tenantId, User.tenantId y
-- User.restaurantId dejan de ser nullable para garantizar aislamiento.

-- 1. Back-fill User.tenantId desde el restaurante asociado.
UPDATE "users" u
SET "tenantId" = r."tenantId"
FROM "restaurants" r
WHERE u."restaurantId" = r."id"
  AND u."tenantId" IS NULL
  AND r."tenantId" IS NOT NULL;

-- 2. Guard: si después del back-fill queda algún NULL, abortar — operadores
--    deben resolver esas filas antes de aplicar la migración. Mejor romper
--    la deploy que aplicar silenciosamente constraints sobre datos sucios.
DO $$
DECLARE n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n FROM "restaurants" WHERE "tenantId" IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % restaurants tienen tenantId NULL. Resuélvelos antes de aplicar.', n;
  END IF;

  SELECT COUNT(*) INTO n FROM "users" WHERE "tenantId" IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % users tienen tenantId NULL. Resuélvelos antes de aplicar.', n;
  END IF;

  SELECT COUNT(*) INTO n FROM "users" WHERE "restaurantId" IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % users tienen restaurantId NULL. Resuélvelos antes de aplicar.', n;
  END IF;
END $$;

-- 3. Lock columns to NOT NULL.
ALTER TABLE "restaurants" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "restaurantId" SET NOT NULL;
