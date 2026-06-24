-- Imagen de portada (hero) opcional del storefront (tema Mundialista).
-- Aditiva: columna nueva nullable, no toca datos existentes.
ALTER TABLE "restaurant_config" ADD COLUMN "storefrontHeroUrl" TEXT;
