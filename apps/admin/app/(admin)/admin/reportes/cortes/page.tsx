"use client";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  Wallet, Bike, ChevronDown, ChevronRight, Download, RotateCw,
  TrendingUp, TrendingDown, ScrollText,
} from "lucide-react";
import api from "@/lib/api";
import { WtScreen, PageHeader, WtCard, StatTile, Pill, EmptyState } from "@/components/warmtech";

/* ── Tipos ── */
type ShiftExpense = { id: string; description: string; amount: number; category: string };
type ShiftCashIn = { id: string; description: string; amount: number; category: string };
type CashShift = {
  id: string; employeeName: string | null; openedAt: string; closedAt: string | null; isOpen: boolean;
  openingFloat: number; closingFloat: number | null; expectedCash: number | null; blindClose: boolean;
  totalCash: number; totalCard: number; totalTransfer: number; totalCourtesy: number; totalTips: number;
  totalSales: number; totalExpenses: number; totalCashIn: number; ordersCount: number; notes: string | null;
  expenses: ShiftExpense[]; cashIns: ShiftCashIn[];
};
type DriverCut = {
  id: string; driverName: string; totalFloat: number; totalIncome: number; totalExpense: number;
  totalReturn: number; balance: number; movements: number; notes: string | null; createdAt: string;
};

type Row =
  | { kind: "shift"; id: string; date: string; who: string; balance: number; data: CashShift }
  | { kind: "driver"; id: string; date: string; who: string; balance: number; data: DriverCut };

type Filter = "ALL" | "shift" | "driver";

/* ── Helpers ── */
const mny = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const todayMx = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

export default function CortesUnificadosPage() {
  const [shifts, setShifts] = useState<CashShift[]>([]);
  const [cuts, setCuts] = useState<DriverCut[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [date, setDate] = useState<string>(""); // "" = todas las fechas
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const safe = <T,>(p: Promise<{ data: T }>, fb: T): Promise<T> => p.then((r) => r.data).catch(() => fb);
    Promise.all([
      safe<CashShift[]>(api.get("/api/shifts"), []),
      safe<DriverCut[]>(api.get("/api/driver-cash/cuts"), []),
    ]).then(([s, c]) => {
      if (cancel) return;
      setShifts(Array.isArray(s) ? s : []);
      setCuts(Array.isArray(c) ? c : []);
    }).catch(() => !cancel && setError("No pude cargar los cortes."))
      .finally(() => !cancel && setLoading(false));
    return () => { cancel = true; };
  }, []);

  // Unifica y ordena por fecha desc.
  const rows = useMemo<Row[]>(() => {
    const sRows: Row[] = shifts.map((s) => ({
      kind: "shift", id: "s_" + s.id, date: s.closedAt || s.openedAt, who: s.employeeName || "Cajero",
      balance: s.closingFloat ?? s.expectedCash ?? 0, data: s,
    }));
    const dRows: Row[] = cuts.map((c) => ({
      kind: "driver", id: "d_" + c.id, date: c.createdAt, who: c.driverName, balance: c.balance, data: c,
    }));
    let all = [...sRows, ...dRows];
    if (filter !== "ALL") all = all.filter((r) => r.kind === filter);
    if (date) all = all.filter((r) => dayKey(r.date) === date);
    return all.sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [shifts, cuts, filter, date]);

  // KPIs del conjunto filtrado.
  const kpi = useMemo(() => {
    const shiftRows = rows.filter((r) => r.kind === "shift") as Extract<Row, { kind: "shift" }>[];
    const driverRows = rows.filter((r) => r.kind === "driver") as Extract<Row, { kind: "driver" }>[];
    let faltante = 0, sobrante = 0;
    for (const r of shiftRows) {
      const s = r.data;
      if (!s.isOpen && s.closingFloat != null && s.expectedCash != null) {
        const diff = s.closingFloat - s.expectedCash;
        if (diff < 0) faltante += diff; else sobrante += diff;
      }
    }
    return {
      count: rows.length,
      ventasCaja: shiftRows.reduce((a, r) => a + (r.data.totalSales || 0), 0),
      balanceRep: driverRows.reduce((a, r) => a + (r.data.balance || 0), 0),
      faltante, sobrante,
    };
  }, [rows]);

  function exportCsv() {
    const head = ["Tipo", "Quien", "Fecha", "Balance/Entregado", "Ventas", "Gastos", "Esperado", "Contado", "Diferencia"];
    const lines = rows.map((r) => {
      if (r.kind === "shift") {
        const s = r.data;
        const diff = (!s.isOpen && s.closingFloat != null && s.expectedCash != null) ? (s.closingFloat - s.expectedCash) : "";
        return ["Caja", r.who, fmtDateTime(r.date), "", s.totalSales, s.totalExpenses, s.expectedCash ?? "", s.closingFloat ?? "", diff];
      }
      const c = r.data;
      return ["Repartidor", r.who, fmtDateTime(r.date), c.balance, c.totalIncome, c.totalExpense, "", "", ""];
    });
    const csv = [head, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `cortes-${date || "todos"}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Reportes · Cortes"
        title="Cortes de caja"
        subtitle="Cortes de turno (cajero) y de repartidores, en un solo lugar."
      />

      {/* Controles */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <div style={{ display: "inline-flex", background: "var(--surf-2)", border: "1px solid var(--bd-1)", borderRadius: 11, padding: 3 }}>
          {([["ALL", "Todos"], ["shift", "Caja"], ["driver", "Repartidores"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} style={{
              minHeight: 34, padding: "6px 14px", borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: "none",
              fontFamily: "inherit", color: filter === k ? "#f7fbf8" : "var(--tx-mut)",
              background: filter === k ? "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))" : "transparent",
            }}>{label}</button>
          ))}
        </div>
        <input type="date" value={date} max={todayMx()} onChange={(e) => setDate(e.target.value)} style={inputStyle} title="Filtrar por día" />
        {date && <button onClick={() => setDate("")} style={ghostBtn}>Ver todas</button>}
        <div style={{ flex: 1 }} />
        <button onClick={exportCsv} disabled={!rows.length} style={ghostBtn}><Download size={14} /> CSV</button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 18 }}>
        <StatTile icon={ScrollText} value={String(kpi.count)} label="Cortes" />
        <StatTile icon={Wallet} value={mny(kpi.ventasCaja)} label="Ventas en caja" />
        <StatTile icon={Bike} value={mny(kpi.balanceRep)} label="Entregado repartidores" />
        <StatTile icon={kpi.faltante < 0 ? TrendingDown : TrendingUp} value={mny(kpi.faltante)} label="Faltantes en caja" />
        <StatTile value={mny(kpi.sobrante)} label="Sobrantes en caja" />
      </div>

      {error && <WtCard style={{ padding: 16, borderColor: "var(--err)", marginBottom: 16 }}><span style={{ color: "var(--err)", fontSize: 13 }}>{error}</span></WtCard>}

      {loading ? (
        <WtCard style={{ padding: 40, textAlign: "center", color: "var(--tx-mut)" }}><RotateCw size={18} /> Cargando cortes…</WtCard>
      ) : rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="Sin cortes" hint="No hay cortes para este filtro/fecha." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r) => (
            <CorteCard key={r.id} row={r} open={expanded === r.id} onToggle={() => setExpanded(expanded === r.id ? null : r.id)} />
          ))}
        </div>
      )}
    </WtScreen>
  );
}

/* ── Tarjeta de corte (cajero o repartidor) ── */
function CorteCard({ row, open, onToggle }: { row: Row; open: boolean; onToggle: () => void }) {
  const isShift = row.kind === "shift";
  return (
    <WtCard style={{ padding: 0, overflow: "hidden" }}>
      <button onClick={onToggle} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
        background: "transparent", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
      }}>
        <Pill tone={isShift ? "info" : "ac"}>{isShift ? <Wallet size={12} /> : <Bike size={12} />} {isShift ? "Caja" : "Repartidor"}</Pill>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, color: "var(--tx-hi)", fontSize: 14 }}>{row.who}</div>
          <div style={{ fontSize: 12, color: "var(--tx-mut)" }}>{fmtDateTime(row.date)}</div>
        </div>
        {isShift && (row.data as CashShift).isOpen && <Pill tone="warn">Abierto</Pill>}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: "var(--tx-hi)", fontSize: 15 }}>{mny(row.balance)}</div>
          <div style={{ fontSize: 10.5, color: "var(--tx-mut)", letterSpacing: ".06em" }}>{isShift ? "EN CAJA" : "ENTREGADO"}</div>
        </div>
        {open ? <ChevronDown size={16} style={{ color: "var(--tx-mut)" }} /> : <ChevronRight size={16} style={{ color: "var(--tx-mut)" }} />}
      </button>

      {open && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--bd-1)" }}>
          {isShift ? <ShiftDetail s={row.data as CashShift} /> : <DriverDetail c={row.data as DriverCut} />}
        </div>
      )}
    </WtCard>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "ok" | "err" }) {
  return (
    <div style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9.5, color: "var(--tx-dim)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, fontSize: 14, color: tone === "err" ? "var(--err)" : tone === "ok" ? "var(--ok)" : "var(--tx-hi)" }}>{value}</div>
    </div>
  );
}

function ShiftDetail({ s }: { s: CashShift }) {
  const diff = (!s.isOpen && s.closingFloat != null && s.expectedCash != null) ? s.closingFloat - s.expectedCash : null;
  return (
    <div style={{ paddingTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8 }}>
        <Cell label="Ventas" value={mny(s.totalSales)} />
        <Cell label="Efectivo" value={mny(s.totalCash)} />
        <Cell label="Tarjeta" value={mny(s.totalCard)} />
        <Cell label="Transfer." value={mny(s.totalTransfer)} />
        <Cell label="Fondo inicial" value={mny(s.openingFloat)} />
        <Cell label="Ingresos caja" value={mny(s.totalCashIn)} />
        <Cell label="Gastos" value={mny(s.totalExpenses)} />
        <Cell label="Pedidos" value={String(s.ordersCount)} />
        <Cell label="Efectivo esperado" value={s.expectedCash != null ? mny(s.expectedCash) : "—"} />
        <Cell label="Efectivo contado" value={s.closingFloat != null ? mny(s.closingFloat) : "—"} />
        {diff != null && <Cell label={diff < 0 ? "Faltante" : "Sobrante"} value={mny(diff)} tone={diff < 0 ? "err" : "ok"} />}
      </div>

      {s.expenses.length > 0 && (
        <div>
          <SubLabel>Gastos del turno ({s.expenses.length})</SubLabel>
          {s.expenses.map((e) => (
            <Line key={e.id} left={e.description || "Gasto"} tag={e.category} right={mny(e.amount)} />
          ))}
        </div>
      )}
      {s.cashIns.length > 0 && (
        <div>
          <SubLabel>Ingresos de efectivo ({s.cashIns.length})</SubLabel>
          {s.cashIns.map((c) => (
            <Line key={c.id} left={c.description || "Ingreso"} tag={c.category} right={mny(c.amount)} />
          ))}
        </div>
      )}
      {s.notes && <Note>{s.notes}</Note>}
    </div>
  );
}

function DriverDetail({ c }: { c: DriverCut }) {
  return (
    <div style={{ paddingTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 8 }}>
        <Cell label="Fondo de cambio" value={mny(c.totalFloat)} />
        <Cell label="Cobrado" value={mny(c.totalIncome)} />
        <Cell label="Gastos" value={mny(c.totalExpense)} />
        <Cell label="Devoluciones" value={mny(c.totalReturn)} />
        <Cell label="Balance entregado" value={mny(c.balance)} tone="ok" />
        <Cell label="Movimientos" value={String(c.movements)} />
      </div>
      {c.notes && <Note>{c.notes}</Note>}
    </div>
  );
}

function SubLabel({ children }: { children: ReactNode }) {
  return <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--tx-dim)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 6 }}>{children}</div>;
}
function Line({ left, tag, right }: { left: string; tag: string; right: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--bd-1)", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ color: "var(--tx-mid)", fontSize: 13 }}>{left}</span>
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9.5, background: "var(--surf-3)", color: "var(--tx-mut)", padding: "2px 6px", borderRadius: 5, letterSpacing: ".06em" }}>{tag}</span>
      </div>
      <span style={{ fontFamily: "'DM Mono',monospace", color: "var(--tx-hi)", fontWeight: 600, fontSize: 13 }}>{right}</span>
    </div>
  );
}
function Note({ children }: { children: ReactNode }) {
  return <div style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: "var(--tx-mid)" }}>📝 {children}</div>;
}

const inputStyle: CSSProperties = {
  background: "var(--surf-2)", border: "1px solid var(--bd-1)", borderRadius: 10,
  color: "var(--tx)", fontSize: 13, padding: "8px 10px", fontFamily: "inherit", minHeight: 38,
};
const ghostBtn: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 13px", borderRadius: 10,
  border: "1px solid var(--bd-1)", background: "var(--surf-1)", color: "var(--tx-mid)",
  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", minHeight: 38,
};
