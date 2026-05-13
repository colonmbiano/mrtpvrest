-- CreateEnum
CREATE TYPE "ExpensePaymentMethod" AS ENUM ('CASH_DRAWER', 'CORPORATE_CARD', 'TRANSFER');

-- AlterTable
ALTER TABLE "shift_expenses" ADD COLUMN     "operatingExpenseId" TEXT,
ADD COLUMN     "purchaseOrderId" TEXT;

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "cashShiftId" TEXT,
ADD COLUMN     "paymentMethod" "ExpensePaymentMethod" NOT NULL DEFAULT 'TRANSFER';

-- CreateTable
CREATE TABLE "operating_expense_categories" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operating_expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operating_expenses" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "categoryId" TEXT,
    "concept" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" "ExpensePaymentMethod" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cashShiftId" TEXT,
    "photoUrl" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operating_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operating_expense_categories_restaurantId_idx" ON "operating_expense_categories"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "operating_expense_categories_restaurantId_name_key" ON "operating_expense_categories"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "operating_expenses_restaurantId_idx" ON "operating_expenses"("restaurantId");

-- CreateIndex
CREATE INDEX "operating_expenses_locationId_occurredAt_idx" ON "operating_expenses"("locationId", "occurredAt");

-- CreateIndex
CREATE INDEX "operating_expenses_categoryId_idx" ON "operating_expenses"("categoryId");

-- CreateIndex
CREATE INDEX "operating_expenses_cashShiftId_idx" ON "operating_expenses"("cashShiftId");

-- CreateIndex
CREATE INDEX "shift_expenses_operatingExpenseId_idx" ON "shift_expenses"("operatingExpenseId");

-- CreateIndex
CREATE INDEX "shift_expenses_purchaseOrderId_idx" ON "shift_expenses"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "purchase_orders_cashShiftId_idx" ON "purchase_orders"("cashShiftId");

-- AddForeignKey
ALTER TABLE "shift_expenses" ADD CONSTRAINT "shift_expenses_operatingExpenseId_fkey" FOREIGN KEY ("operatingExpenseId") REFERENCES "operating_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_expenses" ADD CONSTRAINT "shift_expenses_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "cash_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operating_expense_categories" ADD CONSTRAINT "operating_expense_categories_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operating_expenses" ADD CONSTRAINT "operating_expenses_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operating_expenses" ADD CONSTRAINT "operating_expenses_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operating_expenses" ADD CONSTRAINT "operating_expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "operating_expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operating_expenses" ADD CONSTRAINT "operating_expenses_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "cash_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operating_expenses" ADD CONSTRAINT "operating_expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
