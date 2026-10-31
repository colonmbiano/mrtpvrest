-- Fase 0 del PR #162: verificaciones de SOLO LECTURA (sección 3 del documento de activación).
-- Devuelve una sola fila JSON. Las consultas de huérfanos (3.4) solo corren si la tabla existe.
WITH huerfanos(nombre, tabla, consulta) AS (VALUES
  ('delivery_incidents→orders', 'delivery_incidents', 'SELECT count(*) AS c FROM delivery_incidents x LEFT JOIN orders o ON o.id = x."orderId" AND o."restaurantId" = x."restaurantId" WHERE o.id IS NULL'),
  ('delivery_evidence→orders', 'delivery_evidence', 'SELECT count(*) AS c FROM delivery_evidence x LEFT JOIN orders o ON o.id = x."orderId" AND o."restaurantId" = x."restaurantId" WHERE o.id IS NULL'),
  ('marketplace_payments→orders', 'marketplace_payments', 'SELECT count(*) AS c FROM marketplace_payments x LEFT JOIN orders o ON o.id = x."orderId" AND o."restaurantId" = x."restaurantId" WHERE o.id IS NULL'),
  ('marketplace_order_pipelines→orders', 'marketplace_order_pipelines', 'SELECT count(*) AS c FROM marketplace_order_pipelines x LEFT JOIN orders o ON o.id = x."orderId" AND o."restaurantId" = x."restaurantId" WHERE o.id IS NULL'),
  ('location_menu_item_promos→locations', 'location_menu_item_promos', 'SELECT count(*) AS c FROM location_menu_item_promos x LEFT JOIN locations l ON l.id = x."locationId" AND l."restaurantId" = x."restaurantId" WHERE l.id IS NULL'),
  ('location_menu_item_promos→menu_items', 'location_menu_item_promos', 'SELECT count(*) AS c FROM location_menu_item_promos x LEFT JOIN menu_items m ON m.id = x."menuItemId" AND m."restaurantId" = x."restaurantId" WHERE m.id IS NULL'),
  ('marketplace_driver_payouts→Employee', 'marketplace_driver_payouts', 'SELECT count(*) AS c FROM marketplace_driver_payouts x LEFT JOIN "Employee" e ON e.id = x."driverId" WHERE e.id IS NULL')
)
SELECT json_build_object(
  '3.1_migraciones_fallidas', (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL),
  '3.2_terminadas', (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),
  '3.2_ultimas', (SELECT json_agg(migration_name) FROM (SELECT migration_name FROM _prisma_migrations ORDER BY migration_name DESC LIMIT 3) u),
  '3.3_tablas_que_ya_existen', (SELECT coalesce(json_agg(t), '[]'::json) FROM unnest(ARRAY['delivery_incidents','delivery_evidence','marketplace_payments','marketplace_ledger_entries','marketplace_driver_payouts','location_menu_item_promos','marketplace_order_pipelines']) t WHERE to_regclass('public.' || t) IS NOT NULL),
  '3.4_filas_huerfanas', (SELECT json_object_agg(nombre, CASE WHEN to_regclass('public.' || tabla) IS NULL THEN NULL
      ELSE (xpath('/row/c/text()', query_to_xml(consulta, false, true, '')))[1]::text::int END) FROM huerfanos),
  '3.5_filas_por_tabla', (SELECT json_object_agg(relname, n_live_tup) FROM pg_stat_user_tables WHERE relname IN ('orders','locations','menu_items','DriverLocation')),
  '3.6_enum_OrderStatus', (SELECT json_agg(v) FROM unnest(enum_range(NULL::"OrderStatus")) v)
) AS fase0;
