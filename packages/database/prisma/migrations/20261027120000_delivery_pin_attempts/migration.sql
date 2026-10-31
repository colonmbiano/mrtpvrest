-- G8: el freno de intentos del PIN de entrega del reparto propio vivía en memoria
-- (un Map por proceso): un reinicio o una segunda instancia del backend lo reiniciaba.
-- Ahora se guarda aquí (lib/store-delivery-pin.js, createPrismaPinAttempts).
-- CreateTable
CREATE TABLE IF NOT EXISTS "delivery_pin_attempts" (
    "restaurantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_pin_attempts_pkey" PRIMARY KEY ("restaurantId","orderId")
);
