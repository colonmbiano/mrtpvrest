-- No initial overrides: production keeps its existing deployment configuration
-- until the owner deliberately saves from the panel.
ALTER TABLE "global_configs"
  ADD COLUMN IF NOT EXISTS "marketplaceSettings" JSONB,
  ADD COLUMN IF NOT EXISTS "marketplaceSettingsVersion" INTEGER NOT NULL DEFAULT 0;
