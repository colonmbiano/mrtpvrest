-- Adopción de las tablas `admin_*` del panel interno de clientes SaaS.
--
-- Estas tablas entraron a PRODUCCIÓN el 2026-07-09 aplicadas directamente
-- contra Supabase (registradas en `supabase_migrations.schema_migrations` como
-- `admin_panel_clientes` y `admin_daily_reports`), sin pasar por Prisma. Por eso
-- no existían en `schema.prisma` y `prisma migrate diff --from-config-datasource`
-- proponía un `DROP TABLE` de las cuatro: aplicarlo a ciegas habría borrado el
-- checklist de onboarding de todos los tenants.
--
-- Esta migración las adopta. El SQL es una copia fiel del que ya corrió en
-- Supabase, y es idempotente: en producción es un NO-OP, y en BDs construidas
-- desde migraciones (E2E en CI, entornos nuevos) crea las tablas. Mismo patrón
-- que `20260612210000_reconcile_db_push_drift`.
--
-- Nota: usan `timestamptz` y `gen_random_uuid()::text`, a diferencia del resto
-- del schema (`timestamp(3)`, cuid en la app). Se respeta tal cual está en
-- producción para que el diff quede vacío.

-- CreateTable
CREATE TABLE IF NOT EXISTS "admin_onboarding_tasks" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "category" TEXT NOT NULL,
  "step_key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sort_order" INT NOT NULL DEFAULT 0,
  "done" BOOLEAN NOT NULL DEFAULT false,
  "done_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("tenant_id", "step_key")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_aot_tenant" ON "admin_onboarding_tasks"("tenant_id");

-- CreateTable
CREATE TABLE IF NOT EXISTS "admin_message_templates" (
  "id" TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  "title" TEXT NOT NULL,
  "category" TEXT,
  "body" TEXT NOT NULL,
  "sort_order" INT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "admin_client_notes" (
  "id" TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "note" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_acn_tenant" ON "admin_client_notes"("tenant_id");

-- CreateTable
CREATE TABLE IF NOT EXISTS "admin_daily_reports" (
  "id" TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  "report_date" DATE NOT NULL DEFAULT CURRENT_DATE,
  "new_24h" INT NOT NULL DEFAULT 0,
  "summary" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_adr_date" ON "admin_daily_reports"("created_at" DESC);

-- Row Level Security: igual que en producción. El backend entra como owner
-- (postgres) y lo bypassea; sin políticas, cualquier otro rol es deny-all.
ALTER TABLE "admin_onboarding_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_message_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_client_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_daily_reports" ENABLE ROW LEVEL SECURITY;
