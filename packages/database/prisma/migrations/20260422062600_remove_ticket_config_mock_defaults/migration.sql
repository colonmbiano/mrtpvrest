-- Remove mock defaults from TicketConfig and back-fill existing rows.
-- Rows whose businessName/header still equals the old mock "Master Burger's"
-- are set to the parent restaurant's name (joined via locationId → locations
-- → restaurants). Rows whose subheader equals the mock "A chuparse los dedos"
-- are cleared.

-- 1. Back-fill businessName when it still equals the mock brand.
UPDATE "TicketConfig" tc
SET "businessName" = r."name"
FROM "locations" l
JOIN "restaurants" r ON l."restaurantId" = r."id"
WHERE tc."locationId" = l."id"
  AND tc."businessName" = 'Master Burger''s';

-- 2. Back-fill header when it still equals the mock brand.
UPDATE "TicketConfig" tc
SET "header" = r."name"
FROM "locations" l
JOIN "restaurants" r ON l."restaurantId" = r."id"
WHERE tc."locationId" = l."id"
  AND tc."header" = 'Master Burger''s';

-- 3. Clear subheader when it still equals the mock slogan.
UPDATE "TicketConfig"
SET "subheader" = ''
WHERE "subheader" = 'A chuparse los dedos';

-- 4. Drop the mock defaults at the column level.
ALTER TABLE "TicketConfig" ALTER COLUMN "businessName" DROP DEFAULT;
ALTER TABLE "TicketConfig" ALTER COLUMN "header" SET DEFAULT '';
ALTER TABLE "TicketConfig" ALTER COLUMN "subheader" SET DEFAULT '';
