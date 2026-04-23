-- Printer: connectionType enum + campos USB/BT + soporte de cajón.
-- Aditivo y retrocompatible: las impresoras existentes quedan en connectionType
-- = NETWORK con supportsCashDrawer = false (el mismo comportamiento que tenían
-- cuando sólo existían ip/port).

-- ── Enum PrinterConnection ──────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "PrinterConnection" AS ENUM ('NETWORK', 'USB', 'BLUETOOTH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Columnas nuevas en printers ─────────────────────────────────────────────
ALTER TABLE "Printer"
  ADD COLUMN IF NOT EXISTS "connectionType" "PrinterConnection" NOT NULL DEFAULT 'NETWORK',
  ADD COLUMN IF NOT EXISTS "usbPort" TEXT,
  ADD COLUMN IF NOT EXISTS "bluetoothAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "supportsCashDrawer" BOOLEAN NOT NULL DEFAULT false;

-- ── ip ahora es opcional (sólo requerido para NETWORK) ──────────────────────
ALTER TABLE "Printer"
  ALTER COLUMN "ip" DROP NOT NULL;
