-- Caja del repartidor: delegar la recepción/corte a un empleado no-admin.
--
-- Employee.canManageDriverCash: permite recibir y cerrar el corte de los
-- repartidores (caja del repartidor) sin promover al empleado a un rol
-- superior. Pensado para el cajero, ya que al final el efectivo del repartidor
-- se consolida en una sola caja. Default false = mínimo privilegio.
--
-- Aditiva y NOT NULL con DEFAULT, así que el backend viejo (que no la
-- selecciona) sigue funcionando sin romperse.
ALTER TABLE "Employee" ADD COLUMN "canManageDriverCash" BOOLEAN NOT NULL DEFAULT false;
