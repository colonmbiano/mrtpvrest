-- "Quitar ingredientes": distingue grupos de extras que SUMAN (ADD) de los que
-- son modificadores gratis tipo "Sin cebolla" (REMOVE). Cosmético/semántico; el
-- dinero e inventario no cambian (los REMOVE son priceAdd=0).
ALTER TABLE "modifier_groups" ADD COLUMN "groupType" TEXT NOT NULL DEFAULT 'ADD';
