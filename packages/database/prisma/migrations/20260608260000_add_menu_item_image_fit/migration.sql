-- Encuadre de la foto del platillo en tarjetas del menú/tienda.
-- "cover" (default) rellena y recorta; "contain" muestra la foto completa.
ALTER TABLE "menu_items" ADD COLUMN "imageFit" TEXT NOT NULL DEFAULT 'cover';
