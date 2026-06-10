-- País del restaurante (ISO 3166-1 alpha-2) para derivar la lada de WhatsApp.
-- Default "MX" para no cambiar el comportamiento de los restaurantes existentes.
ALTER TABLE "restaurant_config" ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT 'MX';
