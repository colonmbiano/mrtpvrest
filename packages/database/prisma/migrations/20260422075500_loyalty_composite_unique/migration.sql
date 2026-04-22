-- LoyaltyAccount: unique compuesto (userId, restaurantId) en lugar de userId solo.
-- Permite que un mismo user tenga cuenta de lealtad en múltiples restaurants.
-- Backfill seguro: el unique viejo ya garantizaba 1 cuenta por user, que es
-- un subset del nuevo unique compuesto. Sin conflictos esperados.

DROP INDEX IF EXISTS "loyalty_accounts_userId_key";

CREATE UNIQUE INDEX "loyalty_accounts_userId_restaurantId_key"
  ON "loyalty_accounts"("userId", "restaurantId");
