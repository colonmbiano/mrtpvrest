-- Backfill del directorio de clientes desde pedidos históricos.
-- Best-effort: TODO va dentro de un bloque con manejo de excepción para que un
-- fallo aquí NUNCA tumbe el deploy (la tabla 'customers' ya se creó en la
-- migración anterior). Si algo sale mal, los clientes simplemente se poblarán
-- con los pedidos nuevos de aquí en adelante.
--
-- Normalización del teléfono (igual que normalizePhone en packages/config/phone.js):
--   solo dígitos → quita ceros a la izquierda → si quedan >10, toma los últimos 10.
-- Se descartan teléfonos con menos de 7 dígitos (no buscables desde el TPV).
DO $$
BEGIN
  -- 1. Crear un Customer por (restaurantId, teléfono normalizado) agregando
  --    los pedidos históricos. name/address toman el valor más reciente no vacío.
  WITH keyed AS (
    SELECT
      o.rid,
      o.total,
      o.created_at,
      o.cname,
      o.caddr,
      CASE WHEN length(o.d) > 10 THEN right(o.d, 10) ELSE o.d END AS phone
    FROM (
      SELECT
        "restaurantId" AS rid,
        COALESCE(total, 0) AS total,
        "createdAt" AS created_at,
        NULLIF(btrim("customerName"), '') AS cname,
        NULLIF(btrim("deliveryAddress"), '') AS caddr,
        regexp_replace(regexp_replace("customerPhone", '\D', '', 'g'), '^0+', '') AS d
      FROM "orders"
      WHERE "customerPhone" IS NOT NULL
    ) o
    WHERE length(o.d) >= 7
  )
  INSERT INTO "customers"
    ("id", "restaurantId", "phone", "name", "address", "ordersCount", "totalSpent", "lastOrderAt", "createdAt", "updatedAt")
  SELECT
    -- id determinista (md5 está en el core de Postgres, sin extensiones).
    md5(rid || ':' || phone),
    rid,
    phone,
    (array_remove(array_agg(cname ORDER BY created_at DESC), NULL))[1],
    (array_remove(array_agg(caddr ORDER BY created_at DESC), NULL))[1],
    count(*)::int,
    sum(total),
    max(created_at),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM keyed
  GROUP BY rid, phone
  ON CONFLICT ("restaurantId", "phone") DO NOTHING;

  -- 2. Enlazar cada pedido histórico a su Customer recién creado.
  WITH keyed AS (
    SELECT
      o.id AS oid,
      o.rid,
      CASE WHEN length(o.d) > 10 THEN right(o.d, 10) ELSE o.d END AS phone
    FROM (
      SELECT
        id,
        "restaurantId" AS rid,
        regexp_replace(regexp_replace("customerPhone", '\D', '', 'g'), '^0+', '') AS d
      FROM "orders"
      WHERE "customerPhone" IS NOT NULL AND "customerId" IS NULL
    ) o
    WHERE length(o.d) >= 7
  )
  UPDATE "orders" ord
  SET "customerId" = c."id"
  FROM "customers" c
  JOIN keyed k ON k.rid = c."restaurantId" AND k.phone = c."phone"
  WHERE ord.id = k.oid AND ord."customerId" IS NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'backfill-customers skipped: %', SQLERRM;
END $$;
