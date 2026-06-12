-- Idempotencia de webhooks a nivel BD (docs/AUDITORIA-VALIDACION.md):
-- la dedupe de la app (findFirst + update/updateMany condicional) puede perder
-- la carrera entre dos entregas concurrentes del mismo evento; el UNIQUE la
-- corta en la BD. NULLs siguen permitidos (índice único de Postgres los ignora).
-- Datos verificados sin duplicados antes de crear (2026-06-12).
CREATE UNIQUE INDEX "invoices_externalId_key" ON "invoices"("externalId");
CREATE UNIQUE INDEX "subscriptions_externalId_key" ON "subscriptions"("externalId");
CREATE UNIQUE INDEX "orders_paymentProviderId_key" ON "orders"("paymentProviderId");
