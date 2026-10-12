-- Telemetría tenant-scoped del asistente de WhatsApp.
-- Aditiva y compatible hacia atrás: el código anterior ignora la tabla.

CREATE TABLE IF NOT EXISTS "bot_usage_events" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'WHATSAPP_ASSISTANT',
  "transport" TEXT,
  "aiProvider" TEXT,
  "aiModel" TEXT,
  "inboundMessages" INTEGER NOT NULL DEFAULT 0,
  "outboundMessages" INTEGER NOT NULL DEFAULT 0,
  "aiRequests" INTEGER NOT NULL DEFAULT 0,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens" INTEGER NOT NULL DEFAULT 0,
  "estimatedCostUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
  "externalEventId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bot_usage_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bot_usage_events_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "bot_usage_events_restaurantId_externalEventId_key"
  ON "bot_usage_events"("restaurantId", "externalEventId");
CREATE INDEX IF NOT EXISTS "bot_usage_events_restaurantId_occurredAt_idx"
  ON "bot_usage_events"("restaurantId", "occurredAt");
CREATE INDEX IF NOT EXISTS "bot_usage_events_restaurantId_source_occurredAt_idx"
  ON "bot_usage_events"("restaurantId", "source", "occurredAt");

-- Convención del proyecto: backend-only. La anon key de Supabase no accede.
ALTER TABLE "bot_usage_events" ENABLE ROW LEVEL SECURITY;
