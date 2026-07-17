-- Bono de bienvenida de lealtad: puntos abonados al registrarse en el storefront.
-- 0 = sin bono, así que ningún tenant existente cambia de comportamiento.
ALTER TABLE "restaurant_config" ADD COLUMN "welcomeBonusPoints" INTEGER NOT NULL DEFAULT 0;
