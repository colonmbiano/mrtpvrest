# Arquitectura MRTPVREST - Fase 4: Módulo de Flota y Logística

**Rol:** Senior Backend Engineer & Prisma Expert.
**Objetivo:** Extender el esquema de la base de datos para soportar vehículos, viajes y gastos operativos, y crear la interfaz básica en el backoffice de la sucursal.

## Paso 1: Schema de Prisma (`packages/database`)
1. Crea el modelo `Vehicle`: `id`, `tenantId`, `name` (ej. Moto A), `plate`, `type` (MOTO, CARRO, BICI).
2. Crea el modelo `Ride` (Viaje/Turno): `id`, `tenantId`, `userId` (el repartidor), `vehicleId`, `startTime`, `endTime`, `startMileage`, `endMileage`.
3. Crea el modelo `Expense` (Gasto de Guerrilla): `id`, `tenantId`, `rideId`, `amount`, `category` (GASOLINA, REFACCION, PONCHADURA), `description`.
4. Ejecuta `prisma format`, `prisma generate` y prepara la migración `add_logistics_module`.

## Paso 2: Interfaz en el Panel del Restaurante (`apps/admin`)
1. Crea una nueva sección `/logistics` en el dashboard.
2. Protege la ruta: solo debe ser accesible si el `tenant.hasDelivery` es `true`.
3. Crea un formulario rápido para "Iniciar Turno" donde el empleado seleccione su nombre y el vehículo que usará, insertando un registro en la tabla `Ride`.