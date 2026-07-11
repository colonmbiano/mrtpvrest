-- Redes sociales del negocio en el storefront (Instagram / Facebook / TikTok).
-- El footer las muestra como enlaces reales; null/vacío oculta el ícono.
--
-- Escrita a mano (no por `migrate diff`) siguiendo la convención del repo: la BD
-- de producción tiene tablas `admin_*` fuera de este schema y el diff automático
-- las propone borrar. Aquí solo se AGREGAN columnas nullable (aditivo, seguro).
-- IF NOT EXISTS permite reconciliar sin drift si ya se aplicó a mano en prod.

-- AlterTable
ALTER TABLE "restaurant_config" ADD COLUMN IF NOT EXISTS "instagramUrl" TEXT;
ALTER TABLE "restaurant_config" ADD COLUMN IF NOT EXISTS "facebookUrl" TEXT;
ALTER TABLE "restaurant_config" ADD COLUMN IF NOT EXISTS "tiktokUrl" TEXT;
