-- Marketplace registration phase 2. New tables only; existing tenants, customer
-- auth and employee/driver records are unchanged. Apply in isolated staging first.
CREATE TYPE "MarketplaceSignupRole" AS ENUM ('BUYER', 'MERCHANT', 'COURIER');
CREATE TYPE "MarketplaceApplicationStatus" AS ENUM ('PENDING_EMAIL', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "MarketplaceTokenPurpose" AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET');

CREATE TABLE "marketplace_accounts" (
  "id" TEXT NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "fullName" VARCHAR(120) NOT NULL,
  "phone" VARCHAR(20) NOT NULL,
  "city" VARCHAR(120) NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "emailVerifiedAt" TIMESTAMPTZ(3),
  "disabledAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "marketplace_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "marketplace_accounts_email_key" ON "marketplace_accounts"("email");

CREATE TABLE "marketplace_applications" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "role" "MarketplaceSignupRole" NOT NULL,
  "status" "MarketplaceApplicationStatus" NOT NULL DEFAULT 'PENDING_EMAIL',
  "businessName" VARCHAR(120),
  "businessType" VARCHAR(40),
  "deliveryMode" VARCHAR(20),
  "vehicle" VARCHAR(20),
  "network" VARCHAR(20),
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "marketplace_applications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "marketplace_applications_accountId_role_key" ON "marketplace_applications"("accountId", "role");
CREATE INDEX "marketplace_applications_role_status_createdAt_idx" ON "marketplace_applications"("role", "status", "createdAt");

CREATE TABLE "marketplace_auth_tokens" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "purpose" "MarketplaceTokenPurpose" NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_auth_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "marketplace_auth_tokens_tokenHash_key" ON "marketplace_auth_tokens"("tokenHash");
CREATE INDEX "marketplace_auth_tokens_accountId_purpose_expiresAt_idx" ON "marketplace_auth_tokens"("accountId", "purpose", "expiresAt");

CREATE TABLE "marketplace_sessions" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "marketplace_sessions_tokenHash_key" ON "marketplace_sessions"("tokenHash");
CREATE INDEX "marketplace_sessions_accountId_expiresAt_idx" ON "marketplace_sessions"("accountId", "expiresAt");

ALTER TABLE "marketplace_applications"
  ADD CONSTRAINT "marketplace_applications_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "marketplace_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "marketplace_auth_tokens"
  ADD CONSTRAINT "marketplace_auth_tokens_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "marketplace_accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_sessions"
  ADD CONSTRAINT "marketplace_sessions_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "marketplace_accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
