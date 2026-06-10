ALTER TABLE "access_logs"
ADD COLUMN "correlationId" TEXT;

CREATE INDEX "access_logs_correlationId_idx"
ON "access_logs"("correlationId");
