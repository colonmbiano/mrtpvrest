-- CRM de WhatsApp + juegos promocionales. Tablas nuevas y aisladas: aditivas,
-- seguras para producción (no tocan tablas existentes).

-- ── Contactos (base de clientes para remarketing) ───────────────────────────
CREATE TABLE "whatsapp_contacts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "optIn" BOOLEAN NOT NULL DEFAULT true,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastOrderAt" TIMESTAMP(3),
    "lastContactedAt" TIMESTAMP(3),
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_contacts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "whatsapp_contacts_restaurantId_phone_key" ON "whatsapp_contacts"("restaurantId", "phone");
CREATE INDEX "whatsapp_contacts_restaurantId_idx" ON "whatsapp_contacts"("restaurantId");
ALTER TABLE "whatsapp_contacts"
  ADD CONSTRAINT "whatsapp_contacts_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Juegos promocionales ────────────────────────────────────────────────────
CREATE TABLE "promo_games" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "trigger" TEXT NOT NULL DEFAULT 'ON_COMMAND',
    "prizes" TEXT NOT NULL DEFAULT '[]',
    "maxPerContact" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_games_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "promo_games_restaurantId_idx" ON "promo_games"("restaurantId");
ALTER TABLE "promo_games"
  ADD CONSTRAINT "promo_games_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "promo_game_plays" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "prizeLabel" TEXT NOT NULL,
    "couponId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_game_plays_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "promo_game_plays_gameId_idx" ON "promo_game_plays"("gameId");
CREATE INDEX "promo_game_plays_restaurantId_phone_idx" ON "promo_game_plays"("restaurantId", "phone");
ALTER TABLE "promo_game_plays"
  ADD CONSTRAINT "promo_game_plays_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "promo_games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
