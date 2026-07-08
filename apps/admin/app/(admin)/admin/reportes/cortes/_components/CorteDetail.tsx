"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Bike } from "lucide-react";
import api from "@/lib/api";
import { formatMoney } from "@/lib/format";

/* ── Tipos ── */
export type ShiftExpense = { id: string; description: string; amount: number; category: string };
export type ShiftCashIn = { id: string; description: string; amount: number; category: string };
export type CashShift = {
  id: string; employeeName: string | null; openedAt: string; closedAt: string | null; isOpen: boolean;
  openingFloat: number; closingFloat: number | null; expectedCash: number | null; blindClose: boolean;
  totalCash: number; totalCard: number; totalTransfer: number; totalCourtesy: number; totalTips: number;
  totalSales: number; totalExpenses: number; totalCashIn: number; ordersCount: number; notes: string | null;
  expenses: ShiftExpense[]; cashIns: ShiftCashIn[];
};
export type DriverCut = {
  id: string; driverName: string; totalFloat: number; totalIncome: number; totalExpense: number;
  totalReturn: number; balance: number; movements: number; notes: string | null; createdAt: string;
};
// Liquidación por responsable (caja ÚNICA): rendición de cuentas de cada
// repartidor dentro del turno — no es una caja contable separada.
type Liquidation = {
  driverId: string; driverName: string; fondo: number; compras: number; sobrante: number;
  cobros: number; cobrosTransfer: number; cobrosTarjeta: number; pedidos: number;
  totalAEntregar: number; entregadoReal: number | null; diferencia: number | null;
};

/* ── Piezas de detalle ── */
function Cell({ label, value, tone }: { label: string; value: string; tone?: "ok" | "err" }) {
  return (
    <div className="rounded-ds-sm px-3 py-2.5" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
      <div className="mb-1 font-mono text-[9.5px] uppercase tracking-[.1em] text-tx-dim">{label}</div>
      <div
        className="font-mono text-sm font-bold"
        style={{ color: tone === "err" ? "var(--err)" : tone === "ok" ? "var(--ok)" : "var(--tx-hi)" }}
      >
        {value}
      </div>
    </div>
  );
}

function SubLabel({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[.1em] text-tx-dim">{children}</div>;
}

function Line({ left, tag, right }: { left: string; tag: string; right: string }) {
  return (
    <div className="flex items-center justify-between gap-2.5 py-2" style={{ borderBottom: "1px solid var(--bd-1)" }}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-[13px] text-tx-mid">{left}</span>
        <span className="rounded-md px-1.5 py-0.5 font-mono text-[9.5px] tracking-[.06em] text-tx-mut" style={{ background: "var(--surf-3)" }}>
          {tag}
        </span>
      </div>
      <span className="font-mono text-[13px] font-semibold text-tx-hi">{right}</span>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-ds-sm px-3 py-2.5 text-[12.5px] text-tx-mid" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
      📝 {children}
    </div>
  );
}

/* ── Detalle de corte de caja (cajero) ── */
export function ShiftDetail({ s }: { s: CashShift }) {
  const diff = (!s.isOpen && s.closingFloat != null && s.expectedCash != null) ? s.closingFloat - s.expectedCash : null;
  // Liquidación por responsable — se carga al expandir el corte (lazy).
  const [liq, setLiq] = useState<Liquidation[] | null>(null);
  useEffect(() => {
    let cancel = false;
    api.get(`/api/shifts/${s.id}/liquidation`)
      .then((r) => !cancel && setLiq(Array.isArray(r.data) ? r.data : []))
      .catch(() => !cancel && setLiq([]));
    return () => { cancel = true; };
  }, [s.id]);
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
        <Cell label="Ventas" value={formatMoney(s.totalSales)} />
        <Cell label="Efectivo" value={formatMoney(s.totalCash)} />
        <Cell label="Tarjeta" value={formatMoney(s.totalCard)} />
        <Cell label="Transfer." value={formatMoney(s.totalTransfer)} />
        <Cell label="Fondo inicial" value={formatMoney(s.openingFloat)} />
        <Cell label="Ingresos caja" value={formatMoney(s.totalCashIn)} />
        <Cell label="Gastos" value={formatMoney(s.totalExpenses)} />
        <Cell label="Pedidos" value={String(s.ordersCount)} />
        <Cell label="Efectivo esperado" value={s.expectedCash != null ? formatMoney(s.expectedCash) : "—"} />
        <Cell label="Efectivo contado" value={s.closingFloat != null ? formatMoney(s.closingFloat) : "—"} />
        {diff != null && <Cell label={diff < 0 ? "Faltante" : "Sobrante"} value={formatMoney(diff)} tone={diff < 0 ? "err" : "ok"} />}
      </div>

      {s.expenses.length > 0 && (
        <div>
          <SubLabel>Gastos del turno ({s.expenses.length})</SubLabel>
          {s.expenses.map((e) => (
            <Line key={e.id} left={e.description || "Gasto"} tag={e.category} right={formatMoney(e.amount)} />
          ))}
        </div>
      )}
      {s.cashIns.length > 0 && (
        <div>
          <SubLabel>Ingresos de efectivo ({s.cashIns.length})</SubLabel>
          {s.cashIns.map((c) => (
            <Line key={c.id} left={c.description || "Ingreso"} tag={c.category} right={formatMoney(c.amount)} />
          ))}
        </div>
      )}

      {/* Liquidación por responsable: rendición de cuentas dentro de la caja
          única del turno — el fondo y su comprobación NO se mezclan con ventas. */}
      {liq && liq.length > 0 && (
        <div>
          <SubLabel>Liquidación por responsable ({liq.length})</SubLabel>
          <div className="flex flex-col gap-2.5">
            {liq.map((l) => <LiquidationCard key={l.driverId} l={l} />)}
          </div>
        </div>
      )}
      {s.notes && <Note>{s.notes}</Note>}
    </div>
  );
}

/* ── Detalle de corte de repartidor ── */
export function DriverDetail({ c }: { c: DriverCut }) {
  // Liquidación del repartidor, en el modelo de "una sola caja": todo el
  // efectivo que manejó debe cuadrar entre venta (entregas) y fondo a comprobar
  // (compras + sobrante). Ver la regla en el corte de caja principal.
  //   Sobrante a devolver = Fondo entregado − Compras comprobadas
  //   Total a entregar     = Cobrado en entregas + Sobrante − Devoluciones (= balance)
  const sobrante = (c.totalFloat || 0) - (c.totalExpense || 0);
  return (
    <div className="flex flex-col gap-3.5">
      {/* Venta REAL cobrada en entregas (esto sí es efectivo de venta) */}
      <div>
        <SubLabel>Venta cobrada en entregas</SubLabel>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
          <Cell label="Cobrado en entregas" value={formatMoney(c.totalIncome)} tone="ok" />
        </div>
      </div>

      {/* Fondo — dinero a comprobar, NO es venta */}
      <div>
        <SubLabel>Fondo (dinero a comprobar · no es venta)</SubLabel>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
          <Cell label="Fondo entregado" value={formatMoney(c.totalFloat)} />
          <Cell label="Compras comprobadas" value={formatMoney(c.totalExpense)} />
          <Cell label="Sobrante a devolver" value={formatMoney(sobrante)} tone={sobrante < 0 ? "err" : undefined} />
          {c.totalReturn > 0 && <Cell label="Devoluciones" value={formatMoney(c.totalReturn)} />}
        </div>
      </div>

      {/* Total que el repartidor debe entregar a la caja principal */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
        <Cell label="Total a entregar a caja" value={formatMoney(c.balance)} tone="ok" />
        <Cell label="Movimientos" value={String(c.movements)} />
      </div>

      <Note>El fondo es dinero a comprobar (compras + sobrante), no venta. Total a entregar = cobrado en entregas + sobrante del fondo.</Note>
      {c.notes && <Note>{c.notes}</Note>}
    </div>
  );
}

/* Rendición de cuentas de UN responsable dentro de la caja única del turno.
   Formato canónico (regla del dueño):
     Sobrante de fondo = Fondo recibido − Compras comprobadas
     Total a entregar  = Cobros de pedidos + Sobrante de fondo
   El fondo es dinero a comprobar, NO venta — por eso va desglosado y no sumado
   a los buckets de venta del corte (esos ya lo contemplan sin doble conteo). */
function LiquidationCard({ l }: { l: Liquidation }) {
  const row = (label: string, value: string, opts?: { bold?: boolean; tone?: "ok" | "err" }) => (
    <div className="flex justify-between py-1.5" style={{ borderBottom: "1px solid var(--bd-1)" }}>
      <span className={`text-[12.5px] ${opts?.bold ? "font-bold text-tx-hi" : "font-normal text-tx-mid"}`}>{label}</span>
      <span
        className={`font-mono text-[13px] ${opts?.bold ? "font-bold" : "font-semibold"}`}
        style={{ color: opts?.tone === "err" ? "var(--err)" : opts?.tone === "ok" ? "var(--ok)" : "var(--tx-hi)" }}
      >
        {value}
      </span>
    </div>
  );
  return (
    <div className="rounded-ds-sm px-3 py-2.5" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
      <div className="mb-1.5 flex items-center gap-2">
        <Bike size={13} className="text-tx-mut" />
        <span className="text-[13px] font-bold text-tx-hi">{l.driverName}</span>
        <span className="text-[11px] text-tx-mut">· {l.pedidos} pedido{l.pedidos === 1 ? "" : "s"}</span>
      </div>
      {row("Fondo recibido", formatMoney(l.fondo))}
      {row("Compras comprobadas", l.compras > 0 ? `-${formatMoney(l.compras)}` : formatMoney(0))}
      {row("Sobrante de fondo", formatMoney(l.sobrante), { tone: l.sobrante < 0 ? "err" : undefined })}
      {row("Cobros en efectivo", formatMoney(l.cobros))}
      {l.cobrosTransfer > 0 && row("Cobros por transferencia (verificar en banco)", formatMoney(l.cobrosTransfer))}
      {l.cobrosTarjeta > 0 && row("Cobros con tarjeta (terminal)", formatMoney(l.cobrosTarjeta))}
      {row("Total a entregar (efectivo)", formatMoney(l.totalAEntregar), { bold: true, tone: "ok" })}
      {row("Entregado real", l.entregadoReal != null ? formatMoney(l.entregadoReal) : "$____")}
      {row("Diferencia", l.diferencia != null ? formatMoney(l.diferencia) : "$____", l.diferencia != null && l.diferencia < 0 ? { tone: "err" } : undefined)}
    </div>
  );
}
