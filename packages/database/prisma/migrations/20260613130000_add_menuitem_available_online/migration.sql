-- Visibilidad por producto en la tienda en línea (storefront del client).
-- Independiente de isAvailable (vendible en general / TPV).
-- Aditivo con default true: seguro para producción, no oculta el catálogo
-- existente (todos los productos actuales quedan visibles online).

ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "availableOnline" BOOLEAN NOT NULL DEFAULT true;
