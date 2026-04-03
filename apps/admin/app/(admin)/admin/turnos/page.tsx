"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";

function fmt(n: number) { return `$${(n || 0).toFixed(2)}`; }
function fmtDate(d: string) {
  return new Date(d).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function exportToCSV(shifts: any[]) {
  const headers = [
    "Turno", "Cajero", "Apertura", "Cierre", "Estado",
    "Fondo Inicial", "Fondo Cierre",
    "Efectivo", "Tarjeta", "Transferencia", "Cortesía",
    "Total Ventas", "Gastos", "Pedidos", "Notas"
  ];

  const rows = shifts.map(s => [
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
    s.notes || ""
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
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
        e.amount
      ]);
    }
  }
  if (rows.length === 0) { alert("Sin gastos para exportar"); return; }
  const csv = [headers, ...rows]
    .map(row => row.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
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
      .then(r => setShifts(r.data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = shifts.filter(s => {
    if (filter === "open") return s.isOpen;
    if (filter === "closed") return !s.isOpen;
    return true;
  });

  // Totales globales
  const totals = filtered.filter(s => !s.isOpen).reduce((acc, s) => ({
    sales:    acc.sales    + (s.totalSales    || 0),
    cash:     acc.cash     + (s.totalCash     || 0),
    card:     acc.card     + (s.totalCard     || 0),
    transfer: acc.transfer + (s.totalTransfer || 0),
    expenses: acc.expenses + (s.totalExpenses || 0),
    orders:   acc.orders   + (s.ordersCount   || 0),
  }), { sales: 0, cash: 0, card: 0, transfer: 0, expenses: 0, orders: 0 });

  return (
    <div className="p-6 min-h-screen" style={{ background: "var(--bg)" }}>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-syne font-black text-2xl">Turnos de Caja</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>Historial de aperturas y cierres de caja</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => exportToCSV(filtered)}
            className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2"
            style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)" }}>
            📥 Exportar turnos CSV
          </button>
          <button onClick={() => exportExpensesCSV(filtered)}
            className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2"
            style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
            📥 Exportar gastos CSV
          </button>
        </div>
      </div>

      {/* Stats globales */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: "Total ventas",    value: fmt(totals.sales),    color: "#22c55e", icon: "💰" },
          { label: "Efectivo",        value: fmt(totals.cash),     color: "#22c55e", icon: "💵" },
          { label: "Tarjeta",         value: fmt(totals.card),     color: "#3b82f6", icon: "💳" },
          { label: "Transferencia",   value: fmt(totals.transfer), color: "#8b5cf6", icon: "📲" },
          { label: "Gastos",          value: fmt(totals.expenses), color: "#ef4444", icon: "💸" },
          { label: "Pedidos",         value: totals.orders,        color: "var(--gold)", icon: "🧾" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border p-3 text-center"
            style={{ background: "var(--surf)", borderColor: "var(--border)" }}>
            <div className="text-lg mb-1">{s.icon}</div>
            <div className="font-syne font-black text-lg" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4">
        {[
          { key: "all",    label: `Todos (${shifts.length})` },
          { key: "open",   label: `Abiertos (${shifts.filter(s => s.isOpen).length})` },
          { key: "closed", label: `Cerrados (${shifts.filter(s => !s.isOpen).length})` },
        ].map((f: any) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className="px-4 py-2 rounded-xl text-xs font-bold"
            style={{
              background: filter === f.key ? "var(--gold)" : "var(--surf)",
              color: filter === f.key ? "#000" : "var(--muted)",
              border: "1px solid var(--border)"
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-4xl animate-bounce">🍔</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20" style={{ color: "var(--muted)" }}>Sin turnos registrados</div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(shift => {
            const isExpanded = expanded === shift.id;
            const totalExp = (shift.expenses || []).reduce((s: number, e: any) => s + e.amount, 0);

            return (
              <div key={shift.id} className="rounded-2xl border overflow-hidden"
                style={{ background: "var(--surf)", borderColor: shift.isOpen ? "rgba(34,197,94,0.4)" : "var(--border)" }}>

                {/* Row principal */}
                <button className="w-full px-5 py-4 flex items-center gap-4 text-left"
                  onClick={() => setExpanded(isExpanded ? null : shift.id)}>

                  {/* Estado */}
                  <div className="flex-shrink-0">
                    <div className={`w-3 h-3 rounded-full ${shift.isOpen ? "animate-pulse" : ""}`}
                      style={{ background: shift.isOpen ? "#22c55e" : "var(--muted)" }} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-syne font-black text-sm">#{shift.id.slice(-6).toUpperCase()}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: shift.isOpen ? "rgba(34,197,94,0.12)" : "var(--surf2)",
                          color: shift.isOpen ? "#22c55e" : "var(--muted)"
                        }}>
                        {shift.isOpen ? "Abierto" : "Cerrado"}
                      </span>
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                      {shift.employeeName} · {fmtDate(shift.openedAt)}
                      {shift.closedAt && ` → ${fmtDate(shift.closedAt)}`}
                    </div>
                  </div>

                  {/* Montos */}
                  <div className="flex gap-4 flex-shrink-0 hidden sm:flex">
                    <div className="text-right">
                      <div className="text-xs" style={{ color: "var(--muted)" }}>Ventas</div>
                      <div className="font-syne font-black text-sm" style={{ color: "#22c55e" }}>{fmt(shift.totalSales)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs" style={{ color: "var(--muted)" }}>Gastos</div>
                      <div className="font-syne font-black text-sm" style={{ color: "#ef4444" }}>{fmt(totalExp)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs" style={{ color: "var(--muted)" }}>Pedidos</div>
                      <div className="font-syne font-black text-sm" style={{ color: "var(--gold)" }}>{shift.ordersCount}</div>
                    </div>
                  </div>

                  <span className="text-sm flex-shrink-0" style={{ color: "var(--muted)" }}>{isExpanded ? "▲" : "▼"}</span>
                </button>

                {/* Detalle expandido */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t" style={{ borderColor: "var(--border)" }}>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 mb-4">
                      {[
                        { label: "Fondo inicial", value: fmt(shift.openingFloat), color: "var(--gold)" },
                        { label: "Efectivo",       value: fmt(shift.totalCash),     color: "#22c55e" },
                        { label: "Tarjeta",        value: fmt(shift.totalCard),     color: "#3b82f6" },
                        { label: "Transferencia",  value: fmt(shift.totalTransfer), color: "#8b5cf6" },
                        { label: "Cortesía",       value: fmt(shift.totalCourtesy), color: "#f59e0b" },
                        { label: "Total ventas",   value: fmt(shift.totalSales),    color: "#22c55e" },
                        { label: "Gastos",         value: fmt(totalExp),            color: "#ef4444" },
                        { label: "Fondo cierre",   value: shift.closingFloat != null ? fmt(shift.closingFloat) : "—", color: "#3b82f6" },
                      ].map(row => (
                        <div key={row.label} className="rounded-xl p-3 text-center"
                          style={{ background: "var(--surf2)", border: "1px solid var(--border)" }}>
                          <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>{row.label}</div>
                          <div className="font-syne font-black" style={{ color: row.color }}>{row.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Gastos */}
                    {(shift.expenses || []).length > 0 && (
                      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                        <div className="px-4 py-2 text-xs font-black uppercase tracking-wider"
                          style={{ background: "var(--surf2)", color: "var(--muted)" }}>
                          Gastos del turno
                        </div>
                        {shift.expenses.map((exp: any) => (
                          <div key={exp.id} className="flex justify-between items-center px-4 py-2 border-t text-sm"
                            style={{ borderColor: "var(--border)" }}>
                            <div>
                              <span className="font-medium">{exp.description}</span>
                              <span className="text-xs ml-2" style={{ color: "var(--muted)" }}>{exp.category}</span>
                            </div>
                            <span className="font-syne font-black" style={{ color: "#ef4444" }}>${exp.amount.toFixed(0)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {shift.notes && (
                      <div className="mt-3 text-xs p-3 rounded-xl" style={{ background: "var(--surf2)", color: "var(--muted)" }}>
                        📝 {shift.notes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}