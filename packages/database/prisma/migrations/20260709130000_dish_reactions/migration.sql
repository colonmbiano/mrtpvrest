-- Reacciones ("me gusta") de clientes a platillos en la tienda pública.
-- Tabla nueva, aditiva y aislada: no toca tablas existentes, segura para producción.

CREATE TABLE "dish_reactions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dish_reactions_pkey" PRIMARY KEY ("id")
);

-- Un navegador (clientId) cuenta una sola vez por platillo.
CREATE UNIQUE INDEX "dish_reactions_menuItemId_clientId_key" ON "dish_reactions"("menuItemId", "clientId");
CREATE INDEX "dish_reactions_restaurantId_menuItemId_idx" ON "dish_reactions"("restaurantId", "menuItemId");

-- Limpieza en cascada al borrar el platillo.
ALTER TABLE "dish_reactions" ADD CONSTRAINT "dish_reactions_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
