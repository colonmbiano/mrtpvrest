-- OTA bundles: metadata de releases live-update del TPV (Capacitor).
-- El zip vive en Supabase Storage; acá guardamos versionado, checksum y flags.

CREATE TABLE IF NOT EXISTS "ota_bundles" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL DEFAULT 'com.mrtpvrest.tpv',
    "version" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'production',
    "storagePath" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "minNative" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ota_bundles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ota_bundles_appId_channel_version_key"
    ON "ota_bundles"("appId", "channel", "version");

CREATE INDEX IF NOT EXISTS "ota_bundles_appId_channel_isActive_createdAt_idx"
    ON "ota_bundles"("appId", "channel", "isActive", "createdAt");
