-- Ingresos de efectivo a caja durante el turno (contraparte de shift_expenses).
-- El cajero mete cambio/feria a la gaveta; suma al efectivo esperado del corte.

-- AlterTable: snapshot agregado en el cierre.
ALTER TABLE "cash_shifts" ADD COLUMN "totalCashIn" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "shift_cash_ins" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'CHANGE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_cash_ins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_cash_ins_shiftId_idx" ON "shift_cash_ins"("shiftId");

-- AddForeignKey
ALTER TABLE "shift_cash_ins" ADD CONSTRAINT "shift_cash_ins_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "cash_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
