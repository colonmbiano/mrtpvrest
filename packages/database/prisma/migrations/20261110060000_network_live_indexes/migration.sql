-- C6: el motor de la red carga solo tareas vivas, sus ofertas vigentes y sus asignaciones por taskId.
-- Solo índices nuevos; compatible con la versión anterior del backend.
CREATE INDEX IF NOT EXISTS "marketplace_network_tasks_status_id_idx" ON "marketplace_network_tasks"("status", "id");
CREATE INDEX IF NOT EXISTS "marketplace_network_offers_taskId_status_idx" ON "marketplace_network_offers"("taskId", "status");
CREATE INDEX IF NOT EXISTS "marketplace_network_assignments_taskId_idx" ON "marketplace_network_assignments"("taskId");
