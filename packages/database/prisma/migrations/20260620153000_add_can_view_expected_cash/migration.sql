-- Corte de caja: visibilidad del efectivo esperado.
--
-- Employee.canViewExpectedCash: rompe el corte ciego para ese empleado (ve el
-- efectivo esperado en vivo en /cierre). Default false = mínimo privilegio.
--
-- restaurant_config.adminCanViewExpectedCash: si los roles admin/owner ven el
-- esperado en un turno ciego. Default true = comportamiento histórico; false →
-- corte ciego estricto incluso para admins (solo el permiso explícito revela).
--
-- Ambas columnas son aditivas y NOT NULL con DEFAULT, así que el backend viejo
-- (que no las selecciona) sigue funcionando sin romperse.
ALTER TABLE "Employee" ADD COLUMN "canViewExpectedCash" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "restaurant_config" ADD COLUMN "adminCanViewExpectedCash" BOOLEAN NOT NULL DEFAULT true;
