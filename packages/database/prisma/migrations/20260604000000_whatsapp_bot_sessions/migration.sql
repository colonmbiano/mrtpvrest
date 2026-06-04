-- Chatbot de WhatsApp · estado de la conversación de toma de pedidos.
-- Tabla nueva, aditiva y aislada: no toca tablas existentes, segura para producción.

CREATE TABLE "whatsapp_sessions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'GREETING',
    "data" TEXT NOT NULL DEFAULT '{}',
    "lastOrderId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_sessions_pkey" PRIMARY KEY ("id")
);

-- Una conversación viva por (restaurante, número de cliente).
CREATE UNIQUE INDEX "whatsapp_sessions_restaurantId_phone_key" ON "whatsapp_sessions"("restaurantId", "phone");

-- Para caducar/limpiar conversaciones abandonadas.
CREATE INDEX "whatsapp_sessions_expiresAt_idx" ON "whatsapp_sessions"("expiresAt");

ALTER TABLE "whatsapp_sessions"
  ADD CONSTRAINT "whatsapp_sessions_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
