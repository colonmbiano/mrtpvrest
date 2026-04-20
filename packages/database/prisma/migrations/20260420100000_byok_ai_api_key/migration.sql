-- BYOK: Gemini API key del cliente (cifrada AES-256-GCM) + timestamp de validación
ALTER TABLE "restaurants" ADD COLUMN "aiApiKey" TEXT;
ALTER TABLE "restaurants" ADD COLUMN "aiKeyValidatedAt" TIMESTAMP(3);
