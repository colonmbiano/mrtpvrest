-- Bandeja de entrada de WhatsApp · conversaciones y mensajes persistidos.
-- Tablas nuevas, aditivas y aisladas: no tocan tablas existentes, seguras para producción.

CREATE TABLE "whatsapp_conversations" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "needsHumanReason" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- Un hilo por (restaurante, número de cliente).
CREATE UNIQUE INDEX "whatsapp_conversations_restaurantId_phone_key" ON "whatsapp_conversations"("restaurantId", "phone");

-- Listado de la bandeja: filtro por estado ordenado por actividad reciente.
CREATE INDEX "whatsapp_conversations_restaurantId_status_lastMessageAt_idx" ON "whatsapp_conversations"("restaurantId", "status", "lastMessageAt");

ALTER TABLE "whatsapp_conversations"
  ADD CONSTRAINT "whatsapp_conversations_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'IN',
    "type" TEXT NOT NULL DEFAULT 'text',
    "body" TEXT NOT NULL DEFAULT '',
    "waMessageId" TEXT,
    "sentBy" TEXT NOT NULL DEFAULT 'BOT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- Hilo de una conversación en orden cronológico.
CREATE INDEX "whatsapp_messages_conversationId_createdAt_idx" ON "whatsapp_messages"("conversationId", "createdAt");

-- Consultas por tenant (reportes/limpieza).
CREATE INDEX "whatsapp_messages_restaurantId_createdAt_idx" ON "whatsapp_messages"("restaurantId", "createdAt");

ALTER TABLE "whatsapp_messages"
  ADD CONSTRAINT "whatsapp_messages_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
