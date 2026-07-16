-- Retail multigiro · Fases 3 y 4 — mayoreo (ferretería) + compatibilidad y
-- equivalencias (refaccionaria). Ver docs/plan-retail-multigiro.md.
--
-- Cambio ADITIVO: tablas nuevas, ninguna columna existente se toca. El giro ROPA
-- simplemente no las usa (giro.ts declara wholesale/fitment/crossRef = false).
--
-- IF NOT EXISTS para que sea re-ejecutable, igual que las migraciones previas.
--
-- FK de restaurantId en las TRES tablas: todos los modelos Retail* declaran
-- `restaurant Restaurant @relation(onDelete: Cascade)`. Si el schema declara la
-- relación y la migración no crea la FK, prisma migrate detecta drift — que es
-- justo lo que hubo que reconciliar en 20260612210000_reconcile_db_push_drift.

-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 3 · Precio por volumen (mayoreo)
-- El tier aplicable lo resuelve el BACKEND al armar la línea de venta (dinero
-- server-side): el cliente nunca manda precio.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "retail_price_tiers" (
  "id"           TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "skuId"        TEXT NOT NULL,
  -- Decimal(12,3) como el resto de cantidades ⇒ admite tiers de granel (2.5 kg).
  "minQty"       DECIMAL(12,3) NOT NULL,
  -- Decimal, nunca Float ni @db.Money (regla del CLAUDE.md).
  "price"        DECIMAL(12,2) NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "retail_price_tiers_pkey" PRIMARY KEY ("id")
);

-- Un solo precio por (sku, minQty): dos tiers con el mismo mínimo harían que la
-- resolución dependiera del orden de inserción.
CREATE UNIQUE INDEX IF NOT EXISTS "retail_price_tiers_skuId_minQty_key" ON "retail_price_tiers"("skuId", "minQty");
CREATE INDEX IF NOT EXISTS "retail_price_tiers_skuId_minQty_idx" ON "retail_price_tiers"("skuId", "minQty");
CREATE INDEX IF NOT EXISTS "retail_price_tiers_restaurantId_idx" ON "retail_price_tiers"("restaurantId");

-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 4 · Compatibilidad marca-modelo-año (fitment)
-- Cuelga del PRODUCTO, no del SKU: la compatibilidad es del artículo, no de su
-- presentación.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "retail_fitments" (
  "id"           TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "productId"    TEXT NOT NULL,
  "make"         TEXT NOT NULL,
  "model"        TEXT,
  "yearFrom"     INTEGER,
  "yearTo"       INTEGER,
  "engine"       TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "retail_fitments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "retail_fitments_restaurantId_make_model_idx" ON "retail_fitments"("restaurantId", "make", "model");
CREATE INDEX IF NOT EXISTS "retail_fitments_productId_idx" ON "retail_fitments"("productId");

-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 4 · Equivalencias / cross-reference de número de parte
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "retail_cross_refs" (
  "id"           TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "skuId"        TEXT NOT NULL,
  "brand"        TEXT,
  "partNumber"   TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "retail_cross_refs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "retail_cross_refs_skuId_brand_partNumber_key" ON "retail_cross_refs"("skuId", "brand", "partNumber");
CREATE INDEX IF NOT EXISTS "retail_cross_refs_restaurantId_partNumber_idx" ON "retail_cross_refs"("restaurantId", "partNumber");

-- ─────────────────────────────────────────────────────────────────────────────
-- Foreign keys
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "retail_price_tiers" DROP CONSTRAINT IF EXISTS "retail_price_tiers_restaurantId_fkey";
ALTER TABLE "retail_price_tiers" ADD CONSTRAINT "retail_price_tiers_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_price_tiers" DROP CONSTRAINT IF EXISTS "retail_price_tiers_skuId_fkey";
ALTER TABLE "retail_price_tiers" ADD CONSTRAINT "retail_price_tiers_skuId_fkey"
  FOREIGN KEY ("skuId") REFERENCES "retail_skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "retail_fitments" DROP CONSTRAINT IF EXISTS "retail_fitments_restaurantId_fkey";
ALTER TABLE "retail_fitments" ADD CONSTRAINT "retail_fitments_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_fitments" DROP CONSTRAINT IF EXISTS "retail_fitments_productId_fkey";
ALTER TABLE "retail_fitments" ADD CONSTRAINT "retail_fitments_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "retail_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "retail_cross_refs" DROP CONSTRAINT IF EXISTS "retail_cross_refs_restaurantId_fkey";
ALTER TABLE "retail_cross_refs" ADD CONSTRAINT "retail_cross_refs_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "retail_cross_refs" DROP CONSTRAINT IF EXISTS "retail_cross_refs_skuId_fkey";
ALTER TABLE "retail_cross_refs" ADD CONSTRAINT "retail_cross_refs_skuId_fkey"
  FOREIGN KEY ("skuId") REFERENCES "retail_skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
