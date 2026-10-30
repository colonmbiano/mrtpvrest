-- AlterTable
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_network_tasks" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,

    CONSTRAINT "marketplace_network_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_network_offers" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "courierId" TEXT,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "marketplace_network_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_network_assignments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "marketplace_network_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_network_couriers" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,

    CONSTRAINT "marketplace_network_couriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_network_merchants" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "marketplace_network_merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_network_affiliations" (
    "id" TEXT NOT NULL,
    "courierId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "marketplace_network_affiliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_network_presence" (
    "courierId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "taskId" TEXT,
    "orderId" TEXT,
    "restaurantId" TEXT,
    "locationId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "marketplace_network_presence_pkey" PRIMARY KEY ("courierId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_network_trips" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "marketplace_network_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_refunds" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "activeOrderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "providerRefundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "marketplace_finance_outbox" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_finance_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_network_tasks_orderId_key" ON "marketplace_network_tasks"("orderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_network_tasks_restaurantId_status_idx" ON "marketplace_network_tasks"("restaurantId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_network_tasks_merchantId_status_id_idx" ON "marketplace_network_tasks"("merchantId", "status", "id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_network_tasks_orderId_restaurantId_key" ON "marketplace_network_tasks"("orderId", "restaurantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_network_offers_courierId_status_expiresAt_idx" ON "marketplace_network_offers"("courierId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_network_offers_restaurantId_taskId_idx" ON "marketplace_network_offers"("restaurantId", "taskId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_network_assignments_courierId_status_idx" ON "marketplace_network_assignments"("courierId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_network_assignments_restaurantId_taskId_idx" ON "marketplace_network_assignments"("restaurantId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_network_couriers_accountId_key" ON "marketplace_network_couriers"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_network_merchants_restaurantId_locationId_key" ON "marketplace_network_merchants"("restaurantId", "locationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_network_affiliations_restaurantId_status_idx" ON "marketplace_network_affiliations"("restaurantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_network_affiliations_courierId_merchantId_key" ON "marketplace_network_affiliations"("courierId", "merchantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_network_presence_restaurantId_orderId_idx" ON "marketplace_network_presence"("restaurantId", "orderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_network_trips_kind_idx" ON "marketplace_network_trips"("kind");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_refunds_keyHash_key" ON "marketplace_refunds"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_refunds_activeOrderId_key" ON "marketplace_refunds"("activeOrderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_refunds_restaurantId_orderId_status_idx" ON "marketplace_refunds"("restaurantId", "orderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_finance_outbox_eventKey_key" ON "marketplace_finance_outbox"("eventKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_finance_outbox_status_availableAt_idx" ON "marketplace_finance_outbox"("status", "availableAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "marketplace_finance_outbox_restaurantId_orderId_idx" ON "marketplace_finance_outbox"("restaurantId", "orderId");

-- AddForeignKey
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_network_tasks_orderId_restaurantId_fkey' AND conrelid = '"marketplace_network_tasks"'::regclass) THEN
ALTER TABLE "marketplace_network_tasks" ADD CONSTRAINT "marketplace_network_tasks_orderId_restaurantId_fkey" FOREIGN KEY ("orderId", "restaurantId") REFERENCES "orders"("id", "restaurantId") ON DELETE RESTRICT ON UPDATE CASCADE;
END IF; END $$;

-- AddForeignKey
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_refunds_orderId_restaurantId_fkey' AND conrelid = '"marketplace_refunds"'::regclass) THEN
ALTER TABLE "marketplace_refunds" ADD CONSTRAINT "marketplace_refunds_orderId_restaurantId_fkey" FOREIGN KEY ("orderId", "restaurantId") REFERENCES "orders"("id", "restaurantId") ON DELETE RESTRICT ON UPDATE CASCADE;
END IF; END $$;

-- AddForeignKey
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_finance_outbox_orderId_restaurantId_fkey' AND conrelid = '"marketplace_finance_outbox"'::regclass) THEN
ALTER TABLE "marketplace_finance_outbox" ADD CONSTRAINT "marketplace_finance_outbox_orderId_restaurantId_fkey" FOREIGN KEY ("orderId", "restaurantId") REFERENCES "orders"("id", "restaurantId") ON DELETE RESTRICT ON UPDATE CASCADE;
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='locations_coordinates_valid') THEN ALTER TABLE "locations" ADD CONSTRAINT "locations_coordinates_valid" CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)); END IF; END $$;
