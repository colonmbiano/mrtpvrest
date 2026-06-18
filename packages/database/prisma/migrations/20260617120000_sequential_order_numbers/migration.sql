-- Folio de orden secuencial y continuo POR RESTAURANTE (1, 2, 3...).
-- Antes orderNumber era 'TPV-' + 6 dígitos del timestamp: ni secuencial ni un
-- conteo real. Ahora lo asigna un contador atómico (tabla "counters") dentro de
-- la misma transacción que crea la orden.
--
-- Cambio de unicidad: orderNumber pasa de ÚNICO GLOBAL a ÚNICO POR RESTAURANTE.
-- Necesario porque la serie 1..N de un negocio chocaría con la de otro tenant.
-- Como hoy orderNumber es único global, (restaurantId, orderNumber) ya es único
-- (más fuerte), así que el nuevo índice compuesto se crea sin conflictos.

-- DropIndex: quitar el único global de orderNumber.
DROP INDEX "orders_orderNumber_key";

-- CreateIndex: único por restaurante.
CREATE UNIQUE INDEX "orders_restaurantId_orderNumber_key" ON "orders"("restaurantId", "orderNumber");

-- CreateTable: contadores secuenciales atómicos por restaurante.
CREATE TABLE "counters" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'order',
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "counters_restaurantId_scope_key" ON "counters"("restaurantId", "scope");

-- Seed: el folio es CONTINUO (conteo de por vida), así que arrancamos cada
-- contador en el número de órdenes que el restaurante YA tiene. La próxima
-- orden será (total + 1). Las órdenes históricas conservan su folio 'TPV-xxxxxx';
-- las nuevas siguen la serie numérica.
INSERT INTO "counters" ("id", "restaurantId", "scope", "value", "updatedAt")
SELECT gen_random_uuid()::text, "restaurantId", 'order', COUNT(*), CURRENT_TIMESTAMP
FROM "orders"
GROUP BY "restaurantId";
