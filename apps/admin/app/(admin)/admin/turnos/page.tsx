"use client";
import { useEffect, useState } from "react";
import {
  Download, Wallet, Banknote, CreditCard, Smartphone, TrendingDown,
  Receipt, ChevronDown, ChevronUp, StickyNote, type LucideIcon,
} from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen, PageHeader, WtCard, StatTile, Pill, Segmented, PrimaryBtn,
  EmptyState, type Tone,
} from "@/components/warmtech";

function fmt(n: number) { return `$${(n || 0).toFixed(2)}`; }
function fmtDate(d: string) {
  return new Date(d).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function exportToCSV(shifts: any[]) {
  const headers = [
    "Turno", "Cajero", "Apertura", "Cierre", "Estado",
    "Fondo Inicial", "Fondo Cierre",
    "Efectivo", "Tarjeta", "Transferencia", "Cortesía",
    "Total Ventas", "Gastos", "Pedidos", "Notas",
  ];

  const rows = shifts.map((s) => [
    s.id.slice(-6).toUpperCase(),
    s.employeeName,
    fmtDate(s.openedAt),
    s.closedAt ? fmtDate(s.closedAt) : "Abierto",
    s.isOpen ? "Abierto" : "Cerrado",
    s.openingFloat,
    s.closingFloat ?? "",
    s.totalCash,
    s.totalCard,
    s.totalTransfer,
    s.totalCourtesy,
    s.totalSales,
    s.totalExpenses,
    s.ordersCount,
    s.notes || "",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `turnos_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportExpensesCSV(shifts: any[]) {
  const headers = ["Turno", "Cajero", "Fecha", "Descripción", "Categoría", "Monto"];
  const rows: any[] = [];
  for (const s of shifts) {
    for (const e of s.expenses || []) {
      rows.push([
        s.id.slice(-6).toUpperCase(),
        s.employeeName,
        fmtDate(e.createdAt),
        e.description,
        e.category,
        e.amount,
      ]);
    }
  }
  if (rows.length === 0) { alert("Sin gastos para exportar"); return; }
  const csv = [headers, ...rows]
    .map((row) => row.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gastos_turnos_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TurnosPage() {
  const [shifts, setShifts]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter]   = useState<"all" | "open" | "closed">("all");

  useEffect(() => {
    api.get("/api/shifts")
      .then((r) => setShifts(r.data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = shifts.filter((s) => {
    if (filter === "open") return s.isOpen;
    if (filter === "closed") return !s.isOpen;
    return true;
  });

  // Totales globales
  const totals = filtered.filter((s) => !s.isOpen).reduce((acc, s) => ({
    sales:    acc.sales    + (s.totalSales    || 0),
    cash:     acc.cash     + (s.totalCash     || 0),
    card:     acc.card     + (s.totalCard     || 0),
    transfer: acc.transfer + (s.totalTransfer || 0),
    expenses: acc.expenses + (s.totalExpenses || 0),
    orders:   acc.orders   + (s.ordersCount   || 0),
  }), { sales: 0, cash: 0, card: 0, transfer: 0, expenses: 0, orders: 0 });

  const STATS: { icon: LucideIcon; value: string | number; label: string }[] = [
    { icon: Wallet,       value: fmt(totals.sales),    label: "Total ventas"  },
    { icon: Banknote,     value: fmt(totals.cash),     label: "Efectivo"      },
    { icon: CreditCard,   value: fmt(totals.card),     label: "Tarjeta"       },
    { icon: Smartphone,   value: fmt(totals.transfer), label: "Transferencia" },
    { icon: TrendingDown, value: fmt(totals.expenses), label: "Gastos"        },
    { icon: Receipt,      value: totals.orders,        label: "Pedidos"       },
  ];

  const filterOpts = [
    { value: "all",    label: `Todos (${shifts.length})` },
    { value: "open",   label: `Abiertos (${shifts.filter((s) => s.isOpen).length})` },
    { value: "closed", label: `Cerrados (${shifts.filter((s) => !s.isOpen).length})` },
  ] as const;

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Caja & Turnos"
        title="Turnos de Caja"
        subtitle="Historial de aperturas y cierres de caja"
        actions={
          <>
            <PrimaryBtn ghost full={false} icon={Download} onClick={() => exportToCSV(filtered)}>
              Turnos CSV
            </PrimaryBtn>
            <PrimaryBtn ghost full={false} icon={Download} onClick={() => exportExpensesCSV(filtered)}>
              Gastos CSV
            </PrimaryBtn>
          </>
        }
      />

      {/* mobile export */}
      <div className="mb-4 grid grid-cols-2 gap-2 md:hidden">
        <PrimaryBtn ghost icon={Download} onClick={() => exportToCSV(filtered)}>Turnos CSV</PrimaryBtn>
        <PrimaryBtn ghost icon={Download} onClick={() => exportExpensesCSV(filtered)}>Gastos CSV</PrimaryBtn>
      </div>

      {/* stats globales */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {STATS.map((s) => (
          <StatTile key={s.label} icon={s.icon} value={s.value} label={s.label} />
        ))}
      </div>

      {/* filtros */}
      <div className="mt-4">
        <Segmented value={filter} onChange={setFilter} options={filterOpts} className="md:max-w-md" />
      </div>

      {/* lista */}
      <div className="mt-4">
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-[18px] bg-surf-2" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Wallet} title="Sin turnos registrados" hint="Las aperturas y cierres de caja aparecerán aquí." />
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((shift) => {
              const isExpanded = expanded === shift.id;
              const totalExp = (shift.expenses || []).reduce((s: number, e: any) => s + e.amount, 0);
              const detailRows: { label: string; value: string; tone: Tone }[] = [
                { label: "Fondo inicial", value: fmt(shift.openingFloat), tone: "ac"   },
                { label: "Efectivo",      value: fmt(shift.totalCash),     tone: "ok"   },
                { label: "Tarjeta",       value: fmt(shift.totalCard),     tone: "info" },
                { label: "Transferencia", value: fmt(shift.totalTransfer), tone: "ac"   },
                { label: "Cortesía",      value: fmt(shift.totalCourtesy), tone: "warn" },
                { label: "Total ventas",  value: fmt(shift.totalSales),    tone: "ok"   },
                { label: "Gastos",        value: fmt(totalExp),            tone: "err"  },
                { label: "Fondo cierre",  value: shift.closingFloat != null ? fmt(shift.closingFloat) : "—", tone: "info" },
              ];

              return (
                <WtCard
                  key={shift.id}
                  className="overflow-hidden"
                  style={shift.isOpen ? { borderColor: "var(--ok)" } : undefined}
                >
                  {/* row principal */}
                  <button type="button" className="flex w-full items-center gap-3 px-4 py-3.5 text-left" onClick={() => setExpanded(isExpanded ? null : shift.id)}>
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${shift.isOpen ? "animate-pulse" : ""}`}
                      style={{ background: shift.isOpen ? "var(--ok)" : "var(--tx-mut)" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-sm font-extrabold text-tx-hi">#{shift.id.slice(-6).toUpperCase()}</span>
                        <Pill tone={shift.isOpen ? "ok" : "neutral"} live={shift.isOpen}>{shift.isOpen ? "Abierto" : "Cerrado"}</Pill>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-tx-mut">
                        {shift.employeeName} · {fmtDate(shift.openedAt)}
                        {shift.closedAt && ` → ${fmtDate(shift.closedAt)}`}
                      </div>
                    </div>

                    <div className="hidden shrink-0 gap-4 sm:flex">
                      <div className="text-right">
                        <div className="text-[10px] text-tx-mut">Ventas</div>
                        <div className="font-display text-sm font-extrabold" style={{ color: "var(--ok)" }}>{fmt(shift.totalSales)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-tx-mut">Gastos</div>
                        <div className="font-display text-sm font-extrabold" style={{ color: "var(--err)" }}>{fmt(totalExp)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-tx-mut">Pedidos</div>
                        <div className="font-display text-sm font-extrabold text-primary">{shift.ordersCount}</div>
                      </div>
                    </div>

                    <span className="shrink-0 text-tx-mut">{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
                  </button>

                  {/* detalle expandido */}
                  {isExpanded && (
                    <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--bd-1)" }}>
                      <div className="mb-4 mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        {detailRows.map((row) => (
                          <div key={row.label} className="rounded-xl p-3 text-center" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                            <div className="mb-1 text-[11px] text-tx-mut">{row.label}</div>
                            <div className="font-display font-extrabold" style={{ color: `var(--${row.tone === "ac" ? "brand-primary" : row.tone})` }}>{row.value}</div>
                          </div>
                        ))}
                      </div>

                      {/* gastos */}
                      {(shift.expenses || []).length > 0 && (
                        <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--bd-1)" }}>
                          <div className="flex items-center gap-2 px-4 py-2 font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut" style={{ background: "var(--surf-2)" }}>
                            <TrendingDown size={12} /> Gastos del turno
                          </div>
                          {shift.expenses.map((exp: any) => (
                            <div key={exp.id} className="flex items-center justify-between px-4 py-2 text-sm" style={{ borderTop: "1px solid var(--bd-1)" }}>
                              <div className="min-w-0">
                                <span className="font-medium text-tx">{exp.description}</span>
                                <span className="ml-2 text-[11px] text-tx-mut">{exp.category}</span>
                              </div>
                              <span className="font-display font-extrabold" style={{ color: "var(--err)" }}>${exp.amount.toFixed(0)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {shift.notes && (
                        <div className="mt-3 flex items-start gap-2 rounded-xl p-3 text-[11px] text-tx-mut" style={{ background: "var(--surf-2)" }}>
                          <StickyNote size={13} className="mt-0.5 shrink-0" /> {shift.notes}
                        </div>
                      )}
                    </div>
                  )}
                </WtCard>
              );
            })}
          </div>
        )}
      </div>
    </WtScreen>
  );
}
