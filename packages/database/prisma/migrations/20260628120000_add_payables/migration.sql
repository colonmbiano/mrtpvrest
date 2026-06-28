-- Cuentas por pagar: estado de liquidación (PAGADO/PENDIENTE) para gastos
-- operativos y compras de inventario.
--
-- Default PAID = comportamiento actual e histórico intactos (todo lo que ya
-- existe queda como ya pagado). Un registro PENDING NO toca caja: no crea
-- ShiftExpense ni descuenta efectivo esperado. Solo al liquidarse (settle)
-- golpea la caja del día en que realmente se paga.

CREATE TYPE "SettlementStatus" AS ENUM ('PAID', 'PENDING');

-- ── Gastos operativos ──
ALTER TABLE "operating_expenses"
  ADD COLUMN "settlementStatus" "SettlementStatus" NOT NULL DEFAULT 'PAID',
  ADD COLUMN "supplierId"       TEXT,
  ADD COLUMN "dueDate"          TIMESTAMP(3),
  ADD COLUMN "settledAt"        TIMESTAMP(3),
  ADD COLUMN "settledShiftId"   TEXT,
  ADD COLUMN "settledMethod"    "ExpensePaymentMethod";

-- ── Órdenes de compra ──
ALTER TABLE "purchase_orders"
  ADD COLUMN "settlementStatus" "SettlementStatus" NOT NULL DEFAULT 'PAID',
  ADD COLUMN "dueDate"          TIMESTAMP(3),
  ADD COLUMN "settledAt"        TIMESTAMP(3),
  ADD COLUMN "settledShiftId"   TEXT,
  ADD COLUMN "settledMethod"    "ExpensePaymentMethod";

-- FK proveedor en gastos operativos (opcional; SET NULL al borrar proveedor).
ALTER TABLE "operating_expenses"
  ADD CONSTRAINT "operating_expenses_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "operating_expenses_settlementStatus_idx" ON "operating_expenses"("settlementStatus");
CREATE INDEX "operating_expenses_supplierId_idx"       ON "operating_expenses"("supplierId");
CREATE INDEX "purchase_orders_settlementStatus_idx"    ON "purchase_orders"("settlementStatus");
