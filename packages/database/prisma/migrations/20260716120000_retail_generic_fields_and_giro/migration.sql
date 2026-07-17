-- Retail multigiro · Fase 1 — campos genéricos de inventario + giro del tenant.
-- Ver docs/plan-retail-multigiro.md.
--
-- Cambio ADITIVO con defaults → seguro para producción: ninguna fila existente
-- cambia de comportamiento. Los tenants de MODA+ quedan en retailGiro='ROPA' y
-- unitOfMeasure='PZA', que es exactamente lo que la app asume hoy.
--
-- IF NOT EXISTS en todo: hace la migración re-ejecutable sin fallar si se aplica
-- dos veces o si `prisma migrate deploy` la vuelve a tocar en otro entorno
-- (mismo patrón que 20260715120000_add_tenant_isdemo).

-- ─────────────────────────────────────────────────────────────────────────────
-- Giro del tenant retail: ROPA | FERRETERIA | REFACCIONARIA.
-- Ortogonal a Location.businessType (enum, preset operativo del TPV): ése dice
-- "es mostrador", éste dice CUÁL vertical. Texto libre para agregar giros sin
-- migración; la app valida contra apps/moda/src/lib/giro.ts y cae a ROPA si no
-- reconoce el valor.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "restaurant_config" ADD COLUMN IF NOT EXISTS "retailGiro" TEXT NOT NULL DEFAULT 'ROPA';

-- ─────────────────────────────────────────────────────────────────────────────
-- Campos genéricos de SKU. Los atributos existentes (size/color/material/style)
-- NO se tocan: se reetiquetan por giro en la UI, no se migran.
-- ─────────────────────────────────────────────────────────────────────────────

-- Unidad de venta. Las cantidades ya son Decimal(12,3) en retail_stock_by_location,
-- retail_stock_movements y retail_sale_lines, así que el granel (cable por metro,
-- tornillos por kilo) no requiere cambio de tipos — solo saber en qué unidad va.
ALTER TABLE "retail_skus" ADD COLUMN IF NOT EXISTS "unitOfMeasure" TEXT NOT NULL DEFAULT 'PZA'; -- PZA|MTS|KG|LTS|CAJA

-- Conversión caja↔pza al vender/recibir. NULL = no aplica.
-- Decimal, no Float ni @db.Money (regla del CLAUDE.md).
ALTER TABLE "retail_skus" ADD COLUMN IF NOT EXISTS "unitsPerPackage" DECIMAL(12,3);

-- Ubicación física en almacén (pasillo/anaquel/bin). Clave en ferretería:
-- el mostrador busca por ubicación, no por nombre.
ALTER TABLE "retail_skus" ADD COLUMN IF NOT EXISTS "binLocation" TEXT;

-- Proveedor por SKU. Texto libre: no hay tabla de proveedores en el módulo
-- retail todavía, y una FK a una tabla inexistente sería drift.
ALTER TABLE "retail_skus" ADD COLUMN IF NOT EXISTS "supplierRef" TEXT;

-- Sin índice sobre binLocation a propósito: el POS trae el catálogo completo con
-- GET /catalog y filtra en memoria (`products.find(...)` en page.jsx), así que
-- no hay ninguna query que lo use. Cuando exista búsqueda server-side por
-- ubicación, el índice se agrega junto con esa query — y declarado en el schema,
-- no solo aquí, para no dejar drift.
