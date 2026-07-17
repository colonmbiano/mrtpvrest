-- Retail multigiro · FIX de seguridad — habilitar RLS en las 3 tablas nuevas.
--
-- La migración 20260716130000_retail_tiers_fitment_crossref creó
-- retail_price_tiers / retail_fitments / retail_cross_refs con CREATE TABLE crudo
-- y NO habilitó RLS. Las otras 13 tablas retail_* sí lo tienen (todas con RLS on
-- y CERO políticas = deny-all para PostgREST; el acceso legítimo es solo el
-- backend vía Prisma con la conexión directa). Ver docs/TENANCY.md y la nota de
-- que el acceso es backend-only.
--
-- Impacto de no tenerlo: la anon key de Supabase es pública por diseño, así que
-- retail_price_tiers quedaba ESCRIBIBLE desde fuera. Como el backend resuelve el
-- escalón de mayoreo leyendo esa tabla (priceFor en retail.routes.js), insertar
-- un tier con price 0.01 haría que el POS lo cobrara. Es un hueco de dinero, no
-- solo de lectura.
--
-- Se corrige en una migración NUEVA en vez de editar la anterior: esa ya está
-- aplicada en prod y editarla cambiaría su checksum, rompiendo `migrate deploy`
-- en cualquier otro entorno.
--
-- Sin políticas a propósito: RLS on + 0 políticas = deny-all, que es exactamente
-- la convención del resto del esquema. Prisma no pasa por RLS (usa la conexión
-- directa de Postgres), así que el backend sigue funcionando igual.

ALTER TABLE "retail_price_tiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "retail_fitments"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "retail_cross_refs"  ENABLE ROW LEVEL SECURITY;
