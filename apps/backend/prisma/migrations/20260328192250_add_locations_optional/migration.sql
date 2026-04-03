/*
  Warnings:

  - You are about to drop the column `restaurantId` on the `Banner` table. All the data in the column will be lost.
  - You are about to drop the column `restaurantId` on the `Employee` table. All the data in the column will be lost.
  - You are about to drop the column `restaurantId` on the `ExternalOrder` table. All the data in the column will be lost.
  - You are about to drop the column `restaurantId` on the `Ingredient` table. All the data in the column will be lost.
  - You are about to drop the column `restaurantId` on the `Printer` table. All the data in the column will be lost.
  - You are about to drop the column `restaurantId` on the `PushSubscription` table. All the data in the column will be lost.
  - You are about to drop the column `restaurantId` on the `TicketConfig` table. All the data in the column will be lost.
  - You are about to drop the column `restaurantId` on the `Waiter` table. All the data in the column will be lost.
  - You are about to drop the column `restaurantId` on the `cash_shifts` table. All the data in the column will be lost.
  - You are about to drop the column `birthDate` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[locationId]` on the table `TicketConfig` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `restaurantId` to the `coupons` table without a default value. This is not possible if the table is not empty.
  - Added the required column `restaurantId` to the `loyalty_accounts` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Banner" DROP CONSTRAINT "Banner_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "Employee" DROP CONSTRAINT "Employee_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "ExternalOrder" DROP CONSTRAINT "ExternalOrder_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "Ingredient" DROP CONSTRAINT "Ingredient_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "Printer" DROP CONSTRAINT "Printer_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "PushSubscription" DROP CONSTRAINT "PushSubscription_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "TicketConfig" DROP CONSTRAINT "TicketConfig_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "Waiter" DROP CONSTRAINT "Waiter_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "cash_shifts" DROP CONSTRAINT "cash_shifts_restaurantId_fkey";

-- DropIndex
DROP INDEX "TicketConfig_restaurantId_key";

-- AlterTable
ALTER TABLE "Banner" DROP COLUMN "restaurantId",
ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "Employee" DROP COLUMN "restaurantId",
ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "ExternalOrder" DROP COLUMN "restaurantId",
ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "Ingredient" DROP COLUMN "restaurantId",
ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "Printer" DROP COLUMN "restaurantId",
ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "PushSubscription" DROP COLUMN "restaurantId",
ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "TicketConfig" DROP COLUMN "restaurantId",
ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "Waiter" DROP COLUMN "restaurantId",
ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "cash_shifts" DROP COLUMN "restaurantId",
ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "coupons" ADD COLUMN     "restaurantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "loyalty_accounts" ADD COLUMN     "restaurantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "birthDate";

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "locations_restaurantId_slug_key" ON "locations"("restaurantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "TicketConfig_locationId_key" ON "TicketConfig"("locationId");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketConfig" ADD CONSTRAINT "TicketConfig_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Printer" ADD CONSTRAINT "Printer_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Banner" ADD CONSTRAINT "Banner_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waiter" ADD CONSTRAINT "Waiter_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOrder" ADD CONSTRAINT "ExternalOrder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
