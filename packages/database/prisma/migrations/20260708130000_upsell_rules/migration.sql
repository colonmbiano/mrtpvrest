-- Sugerencias de venta (upsell) del chatbot de WhatsApp, con métricas.
-- Tabla nueva, aditiva y aislada: no toca tablas existentes, segura para producción.

CREATE TABLE "upsell_rules" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "menuItemId" TEXT NOT NULL,
    "variantId" TEXT,
    "triggerType" TEXT NOT NULL DEFAULT 'ALWAYS',
    "triggerId" TEXT,
    "minSubtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "offerText" TEXT,
    "offerCount" INTEGER NOT NULL DEFAULT 0,
    "acceptCount" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upsell_rules_pkey" PRIMARY KEY ("id")
);

-- Selección de reglas aplicables al momento del checkout del bot.
CREATE INDEX "upsell_rules_restaurantId_enabled_idx" ON "upsell_rules"("restaurantId", "enabled");
