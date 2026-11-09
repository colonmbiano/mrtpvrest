-- Lealtad para invitados por teléfono.
--
-- Hasta ahora una cuenta de lealtad SIEMPRE requería un User (userId NOT NULL),
-- así que solo acumulaban los clientes identificados (sesión o código). El
-- invitado típico de la tienda (nombre + teléfono) no sumaba nada.
--
-- Con este cambio la cuenta puede existir sin User, identificada por
-- (restaurantId, phone) con el teléfono normalizado. Al registrarse el cliente,
-- su cuenta de invitado se vincula a su User (ver store.routes customer/register).
--
-- Compatibilidad hacia atrás:
--   · userId pasa a nullable: el código anterior que siempre lo setea sigue OK.
--   · phone es una columna nueva nullable: las cuentas registradas la dejan NULL.
--   · El índice único (restaurantId, phone) no choca con las filas existentes
--     (todas tienen phone NULL, y Postgres trata los NULL como distintos).
ALTER TABLE "loyalty_accounts" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "loyalty_accounts" ADD COLUMN "phone" TEXT;
CREATE UNIQUE INDEX "loyalty_accounts_restaurantId_phone_key" ON "loyalty_accounts"("restaurantId", "phone");
