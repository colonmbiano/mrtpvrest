-- Feature flags globales del SaaS mostrados/controlados desde el dashboard
ALTER TABLE "global_configs" ADD COLUMN "openRegistration" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "global_configs" ADD COLUMN "autoTrial"        BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "global_configs" ADD COLUMN "maintenanceMode"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "global_configs" ADD COLUMN "whatsappEnabled"  BOOLEAN NOT NULL DEFAULT true;
