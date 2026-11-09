-- Additive: legacy cuts retain NULL counts; no historical receipts are inferred.
ALTER TABLE "orders"
  ADD COLUMN "cardVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cardVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "cardVerifiedBy" TEXT,
  ADD COLUMN "transferVerificationReference" TEXT,
  ADD COLUMN "cardVerificationReference" TEXT;

ALTER TABLE "DriverCashMovement"
  ADD COLUMN "shiftId" TEXT,
  ADD COLUMN "cutId" TEXT,
  ADD COLUMN "fundSource" TEXT,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "receiptStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "receiptReason" TEXT;

ALTER TABLE "DriverCashCut"
  ADD COLUMN "shiftId" TEXT,
  ADD COLUMN "countedCash" DECIMAL(12,2),
  ADD COLUMN "cashDifference" DECIMAL(12,2),
  ADD COLUMN "differenceReason" TEXT,
  ADD COLUMN "receivedById" TEXT,
  ADD COLUMN "receivedByName" TEXT;

CREATE INDEX "DriverCashMovement_driverId_approved_idx" ON "DriverCashMovement"("driverId", "approved");
CREATE INDEX "DriverCashMovement_shiftId_driverId_idx" ON "DriverCashMovement"("shiftId", "driverId");
CREATE INDEX "DriverCashMovement_cutId_idx" ON "DriverCashMovement"("cutId");
CREATE INDEX "DriverCashCut_shiftId_driverId_idx" ON "DriverCashCut"("shiftId", "driverId");
