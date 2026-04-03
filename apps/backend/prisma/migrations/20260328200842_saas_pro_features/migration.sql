-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "maxLocations" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'BASIC',
ADD COLUMN     "subscriptionEndsAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionStatus" TEXT NOT NULL DEFAULT 'ACTIVE';
