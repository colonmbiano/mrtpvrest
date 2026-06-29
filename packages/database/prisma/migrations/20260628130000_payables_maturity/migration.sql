-- Madurez de cuentas por pagar: pagos parciales (abonos) + gastos recurrentes.

-- ── Pagos parciales ──
-- paidAmount acumula los abonos. Cuando paidAmount >= total/amount, el registro
-- pasa a settlementStatus=PAID. Default 0 = lo histórico no tiene abonos.
ALTER TABLE "operating_expenses" ADD COLUMN "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "purchase_orders"    ADD COLUMN "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- ── Gastos recurrentes ──
-- Plantillas que generan una cuenta por pagar (OperatingExpense PENDING) cada
-- periodo. El generador materializa las vencidas y avanza nextDueAt.
CREATE TABLE "recurring_expenses" (
  "id"              TEXT NOT NULL,
  "restaurantId"    TEXT NOT NULL,
  "locationId"      TEXT,
  "categoryId"      TEXT,
  "supplierId"      TEXT,
  "concept"         TEXT NOT NULL,
  "amount"          DOUBLE PRECISION NOT NULL,
  "frequency"       TEXT NOT NULL DEFAULT 'MONTHLY',
  "dayOfMonth"      INTEGER,
  "nextDueAt"       TIMESTAMP(3) NOT NULL,
  "lastGeneratedAt" TIMESTAMP(3),
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "createdById"     TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "recurring_expenses_restaurantId_isActive_idx" ON "recurring_expenses"("restaurantId", "isActive");
