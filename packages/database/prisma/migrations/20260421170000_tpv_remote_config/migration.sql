-- TPV Remote Config: configuración servida al APK TPV en tiempo de ejecución
-- (por sucursal) para mover comportamiento y branding sin reconstruir el APK.
CREATE TABLE "tpv_remote_configs" (
  "id"                TEXT        NOT NULL,
  "locationId"        TEXT        NOT NULL,
  "apiUrl"            TEXT,
  "allowedOrderTypes" JSONB       NOT NULL DEFAULT '["DINE_IN","TAKEOUT","DELIVERY"]',
  "lockTimeoutSec"    INTEGER     NOT NULL DEFAULT 0,
  "accentColor"       TEXT,
  "extra"             JSONB       NOT NULL DEFAULT '{}',
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tpv_remote_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tpv_remote_configs_locationId_key"
  ON "tpv_remote_configs"("locationId");

ALTER TABLE "tpv_remote_configs"
  ADD CONSTRAINT "tpv_remote_configs_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "locations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
