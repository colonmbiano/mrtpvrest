-- Pago de sueldos por trabajador: liga un gasto (categoría SUELDOS) a un
-- empleado y guarda el detalle del cálculo (días × tarifa) al momento del pago,
-- para poder reportar cuánto se le ha pagado a cada trabajador.
-- Campos nullable/aditivos: no afectan gastos existentes ni otras categorías.
ALTER TABLE "operating_expenses" ADD COLUMN "employeeId" TEXT;
ALTER TABLE "operating_expenses" ADD COLUMN "payrollDays" DOUBLE PRECISION;
ALTER TABLE "operating_expenses" ADD COLUMN "payrollRate" DOUBLE PRECISION;

CREATE INDEX "operating_expenses_employeeId_idx" ON "operating_expenses"("employeeId");

ALTER TABLE "operating_expenses" ADD CONSTRAINT "operating_expenses_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
