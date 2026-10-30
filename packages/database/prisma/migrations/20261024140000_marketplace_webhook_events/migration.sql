-- Marketplace: avisos (webhooks) de Mercado Pago (2026-10-24).
-- Una fila por entrega del aviso: evita procesarlo dos veces y deja auditoría del resultado.
-- Generada SIN CONEXIÓN con `prisma migrate diff --from-schema <schema anterior>
-- --to-schema schema.prisma --script` y reescrita al estilo idempotente del repo.
-- NO aplicada. Solo agrega: una tabla y dos índices.

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "dataId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "action" TEXT,
    "outcome" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "marketplace_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_webhook_events_dataId_idx" ON "marketplace_webhook_events"("dataId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_webhook_events_provider_eventId_key" ON "marketplace_webhook_events"("provider", "eventId");
