ALTER TABLE "menu_items" ADD COLUMN "minWeightKg" DECIMAL(10,3);
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_min_weight_valid"
  CHECK ("minWeightKg" IS NULL OR ("minWeightKg" >= 0.001 AND "minWeightKg" <= 10000));

-- User-requested rollout: current kilo products only. Preserve their prices and extras.
UPDATE "menu_items"
SET "saleUnit" = 'WEIGHT', "soldByWeight" = true, "unit" = 'kg', "minWeightKg" = 1
WHERE "restaurantId" IN (SELECT "id" FROM "restaurants" WHERE "slug" = 'master-burguer-s')
  AND "id" IN ('cmpp2pipe00c81qpl3me2i2v2', 'cmpp2o9of009q1qpljn66ukem');
