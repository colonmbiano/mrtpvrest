"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";

const EXPENSE_CATEGORIES = [
  { value: "SUPPLIES", label: "🛒 Insumos" },
  { value: "CLEANING", label: "🧹 Limpieza" },
  { value: "FOOD",     label: "🍔 Alimentos" },
  { value: "OTHER",    label: "📦 Otro" },
];

interface Props {
  employee: { id: string; name: string; role: string };
  onClose: () => void;
}

export default function ShiftModal({ employee, onClose }: Props) {
  const [shift, setShift]           = useState<any>(null);
  const [loading, setLoading]       = useState(true);
  const [openingFloat, setOpeningFloat] = useState("");
  const [closingFloat, setClosingFloat] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [tab, setTab]               = useState<"summary"|"expenses"|"close">("summary");

  // Gasto nuevo
  const [expDesc, setExpDesc]   = useState("");
  const [expAmt, setExpAmt]     = useState("");
  const [expCat, setExpCat]     = useState("OTHER");
  const [addingExp, setAddingExp] = useState(false);
  const [savingExp, setSavingExp] = useState(false);

  const [opening, setOpening]   = useState(false);
  const [closing, setClosing]   = useState(false);

  useEffect(() => {
    fetchShift();
  }, []);

  async function fetchShift() {
    setLoading(true);
    try {
      const { data } = await api.get("/api/shifts/active");
      setShift(data);
    } catch {}
    finally { setLoading(false); }
  }

  async function openShift() {
    if (!openingFloat) { alert("Ingresa el fondo de caja"); return; }
    setOpening(true);
    try {
      const { data } = await api.post("/api/shifts/open", {
        openingFloat: Number(openingFloat),
        employeeId: employee.id,
        employeeName: employee.name,
      });
      setShift(data);
      setTab("summary");
    } catch (e: any) { alert(e.response?.data?.error || "Error"); }
    finally { setOpening(false); }
  }

  async function addExpense() {
    if (!expDesc || !expAmt) { alert("Completa descripción y monto"); return; }
    setSavingExp(true);
    try {
      const { data } = await api.post(`/api/shifts/${shift.id}/expenses`, {
        description: expDesc,
        amount: Number(expAmt),
        category: expCat,
      });
      setShift((s: any) => ({ ...s, expenses: [data, ...(s.expenses || [])] }));
      setExpDesc(""); setExpAmt(""); setExpCat("OTHER");
      setAddingExp(false);
    } catch (e: any) { alert(e.response?.data?.error || "Error"); }
    finally { setSavingExp(false); }
  }

  async function deleteExpense(id: string) {
    if (!confirm("¿Eliminar este gasto?")) return;
    try {
      await api.delete(`/api/shifts/expenses/${id}`);
      setShift((s: any) => ({ ...s, expenses: s.expenses.filter((e: any) => e.id !== id) }));
    } catch {}
  }

  async function closeShift() {
    if (!confirm("¿Cerrar el turno? Esta acción no se puede deshacer.")) return;
    setClosing(true);
    try {
      const { data } = await api.post(`/api/shifts/${shift.id}/close`, {
        closingFloat: Number(closingFloat) || 0,
        notes: closeNotes,
      });
      setShift(data);
    } catch (e: any) { alert(e.response?.data?.error || "Error"); }
    finally { setClosing(false); }
  }

  function formatTime(date: string) {
    return new Date(date).toLocaleString("es-MX", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
    });
  }

  const totalExpenses = shift?.expenses?.reduce((s: number, e: any) => s + e.amount, 0) || 0;

  // ── SIN TURNO ABIERTO ──
  if (!loading && !shift) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
        <div className="bg-[var(--surf)] border border-[var(--border)] rounded-3xl w-full max-w-sm p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-syne font-black text-white">🕒 Abrir Turno</h2>
            <button onClick={onClose} className="text-[var(--muted)] hover:text-white text-xl">✕</button>
          </div>
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">💰</div>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No hay turno abierto. Ingresa el fondo de caja inicial para comenzar.
            </p>
          </div>
          <div className="mb-4">
            <label className="text-xs font-bold mb-2 block uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Fondo de caja inicial
            </label>
            <input
              type="number" value={openingFloat}
              onChange={e => setOpeningFloat(e.target.value)}
              placeholder="$0.00"
              className="w-full px-4 py-3 rounded-xl text-lg font-black outline-none text-center"
              style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--gold)" }}
            />
          </div>
          <div className="text-xs mb-6 p-3 rounded-xl" style={{ background: "rgba(245,166,35,0.08)", color: "var(--muted)" }}>
            👤 Cajero: <strong style={{ color: "var(--gold)" }}>{employee.name}</strong>
          </div>
          <button onClick={openShift} disabled={opening}
            className="w-full py-4 rounded-2xl font-syne font-black text-base"
            style={{ background: "var(--gold)", color: "#000" }}>
            {opening ? "Abriendo..." : "🟢 Abrir turno"}
          </button>
        </div>
      </div>
    );
  }

  // ── CARGANDO ──
  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="text-4xl animate-bounce">🍔</div>
      </div>
    );
  }

  const isClosed = !shift?.isOpen;
  const isAdmin = ["ADMIN", "MANAGER", "OWNER", "SUPER_ADMIN"].includes(employee.role);
  const shouldHideTotals = shift?.blindClose && !isAdmin;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-[var(--surf)] border border-[var(--border)] rounded-3xl w-full max-w-2xl flex flex-col" style={{ maxHeight: "90vh" }}>

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-xl font-syne font-black text-white flex items-center gap-2">
              🕒 Turno
              {isClosed
                ? <span className="text-xs px-2 py-1 rounded-full font-bold" style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}>Cerrado</span>
                : <span className="text-xs px-2 py-1 rounded-full font-bold" style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>Abierto</span>
              }
            </h2>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              {employee.name} · Inicio: {formatTime(shift.openedAt)}
              {isClosed && shift.closedAt && ` · Cierre: ${formatTime(shift.closedAt)}`}
            </p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: "var(--surf2)", color: "var(--muted)" }}>✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
          {[
            { key: "summary",  label: "📊 Resumen" },
            { key: "expenses", label: `💸 Gastos (${shift?.expenses?.length || 0})` },
            ...(!isClosed ? [{ key: "close", label: "🔒 Cerrar turno" }] : []),
          ].map((t: any) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex-1 py-3 text-xs font-bold transition-all"
              style={{
                color: tab === t.key ? "var(--gold)" : "var(--muted)",
                borderBottom: tab === t.key ? "2px solid var(--gold)" : "2px solid transparent",
                background: tab === t.key ? "rgba(245,166,35,0.05)" : "transparent",
              }}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">

          {/* ── TAB: RESUMEN ── */}
          {tab === "summary" && (
            <div className="flex flex-col gap-4">
              {/* Fondo */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl p-4 text-center" style={{ background: "var(--surf2)", border: "1px solid var(--border)" }}>
                  <div className="text-xs font-bold mb-1 uppercase tracking-wider" style={{ color: "var(--muted)" }}>Fondo inicial</div>
                  <div className="text-2xl font-black" style={{ color: "var(--gold)" }}>${shift.openingFloat.toFixed(0)}</div>
                </div>
                {isClosed && shift.closingFloat != null && (
                  <div className="rounded-2xl p-4 text-center" style={{ background: "var(--surf2)", border: "1px solid var(--border)" }}>
                    <div className="text-xs font-bold mb-1 uppercase tracking-wider" style={{ color: "var(--muted)" }}>Fondo cierre</div>
                    <div className="text-2xl font-black" style={{ color: "#3b82f6" }}>${shift.closingFloat.toFixed(0)}</div>
                  </div>
                )}
              </div>

              {/* Ventas por método */}
              <div className="rounded-2xl border p-4" style={{ background: "var(--surf2)", borderColor: "var(--border)" }}>
                <div className="text-xs font-black uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>Ventas por método de pago</div>
                {shouldHideTotals && !isClosed ? (
                  <div className="py-8 text-center text-xs opacity-50 italic">
                    👁️ El resumen de ventas está oculto (Cierre Ciego activo)
                  </div>
                ) : (
                  [
                    { label: "💵 Efectivo",       value: isClosed ? shift.totalCash     : null, color: "#22c55e" },
                    { label: "💳 Tarjeta",         value: isClosed ? shift.totalCard     : null, color: "#3b82f6" },
                    { label: "📲 Transferencia",   value: isClosed ? shift.totalTransfer : null, color: "#8b5cf6" },
                    { label: "🎁 Cortesía",        value: isClosed ? shift.totalCourtesy : null, color: "#f59e0b" },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between items-center py-2 border-b last:border-0"
                      style={{ borderColor: "var(--border)" }}>
                      <span className="text-sm" style={{ color: "var(--muted)" }}>{row.label}</span>
                      <span className="font-syne font-black text-sm" style={{ color: row.color }}>
                        {row.value != null ? `$${row.value.toFixed(0)}` : "—"}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Totales */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl p-3 text-center" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                  <div className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>Total ventas</div>
                  <div className="text-xl font-black" style={{ color: "#22c55e" }}>
                    {isClosed || !shouldHideTotals ? (shift.totalSales ? `$${shift.totalSales.toFixed(0)}` : "$0") : "—"}
                  </div>
                </div>
                <div className="rounded-2xl p-3 text-center" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <div className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>Gastos</div>
                  <div className="text-xl font-black" style={{ color: "#ef4444" }}>${totalExpenses.toFixed(0)}</div>
                </div>
                <div className="rounded-2xl p-3 text-center" style={{ background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.3)" }}>
                  <div className="text-xs font-bold mb-1" style={{ color: "var(--muted)" }}>Pedidos</div>
                  <div className="text-xl font-black" style={{ color: "var(--gold)" }}>
                    {isClosed || !shouldHideTotals ? (shift.ordersCount || 0) : "—"}
                  </div>
                </div>
              </div>

              {!isClosed && (
                <div className="rounded-2xl p-3 text-xs text-center" style={{ background: "rgba(59,130,246,0.08)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.2)" }}>
                  ℹ️ Las ventas se calculan al cerrar el turno
                </div>
              )}

              {isClosed && shift.notes && (
                <div className="rounded-2xl p-3 text-sm" style={{ background: "var(--surf2)", color: "var(--muted)" }}>
                  📝 {shift.notes}
                </div>
              )}
            </div>
          )}

          {/* ── TAB: GASTOS ── */}
          {tab === "expenses" && (
            <div className="flex flex-col gap-3">
              {!isClosed && (
                <button onClick={() => setAddingExp(true)}
                  className="w-full py-3 rounded-2xl font-syne font-black text-sm"
                  style={{ background: "var(--gold)", color: "#000" }}>
                  + Registrar gasto
                </button>
              )}

              {addingExp && (
                <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ background: "var(--surf2)", borderColor: "var(--gold)" }}>
                  <div className="text-xs font-black uppercase tracking-wider" style={{ color: "var(--gold)" }}>Nuevo gasto</div>
                  <input value={expDesc} onChange={e => setExpDesc(e.target.value)}
                    placeholder="Descripción *"
                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--text)" }} />
                  <div className="flex gap-2">
                    <input type="number" value={expAmt} onChange={e => setExpAmt(e.target.value)}
                      placeholder="Monto *"
                      className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none"
                      style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--text)" }} />
                    <select value={expCat} onChange={e => setExpCat(e.target.value)}
                      className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none"
                      style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--text)" }}>
                      {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setAddingExp(false); setExpDesc(""); setExpAmt(""); }}
                      className="flex-1 py-2 rounded-xl text-xs font-bold border" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                      Cancelar
                    </button>
                    <button onClick={addExpense} disabled={savingExp}
                      className="flex-1 py-2 rounded-xl text-xs font-black" style={{ background: "var(--gold)", color: "#000" }}>
                      {savingExp ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>
              )}

              {shift?.expenses?.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-2">✅</div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>Sin gastos registrados</div>
                </div>
              ) : (
                <>
                  <div className="rounded-2xl p-3 text-center" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    <div className="text-xs font-bold mb-0.5" style={{ color: "var(--muted)" }}>Total gastos</div>
                    <div className="text-2xl font-black" style={{ color: "#ef4444" }}>${totalExpenses.toFixed(0)}</div>
                  </div>
                  {shift.expenses.map((exp: any) => (
                    <div key={exp.id} className="flex items-center gap-3 p-3 rounded-xl border"
                      style={{ background: "var(--surf2)", borderColor: "var(--border)" }}>
                      <div className="text-lg flex-shrink-0">
                        {EXPENSE_CATEGORIES.find(c => c.value === exp.category)?.label.split(" ")[0] || "📦"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold truncate">{exp.description}</div>
                        <div className="text-xs" style={{ color: "var(--muted)" }}>
                          {new Date(exp.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <div className="font-syne font-black" style={{ color: "#ef4444" }}>${exp.amount.toFixed(0)}</div>
                      {!isClosed && (
                        <button onClick={() => deleteExpense(exp.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs"
                          style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>✕</button>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ── TAB: CERRAR TURNO ── */}
          {tab === "close" && !isClosed && (
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl p-4 text-center" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>
                <div className="text-4xl mb-2">🔒</div>
                <div className="font-syne font-black text-lg text-white mb-1">Cerrar turno</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  Al cerrar se calcularán las ventas totales del período
                </div>
              </div>

              <div>
                <label className="text-xs font-bold mb-2 block uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  Fondo de caja al cierre
                </label>
                <input type="number" value={closingFloat} onChange={e => setClosingFloat(e.target.value)}
                  placeholder="$0.00"
                  className="w-full px-4 py-3 rounded-xl text-lg font-black outline-none text-center"
                  style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--gold)" }} />
              </div>

              <div>
                <label className="text-xs font-bold mb-2 block uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  Notas del turno (opcional)
                </label>
                <textarea value={closeNotes} onChange={e => setCloseNotes(e.target.value)}
                  placeholder="Observaciones, incidencias..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
                  style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--text)" }} />
              </div>

              {/* Resumen rápido */}
              <div className="rounded-2xl border p-4" style={{ background: "var(--surf2)", borderColor: "var(--border)" }}>
                <div className="text-xs font-black uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>Resumen al cierre</div>
                <div className="flex justify-between text-sm py-1">
                  <span style={{ color: "var(--muted)" }}>Fondo inicial</span>
                  <span className="font-bold">${shift.openingFloat.toFixed(0)}</span>
                </div>
                <div className="flex justify-between text-sm py-1">
                  <span style={{ color: "var(--muted)" }}>Gastos registrados</span>
                  <span className="font-bold" style={{ color: "#ef4444" }}>-${totalExpenses.toFixed(0)}</span>
                </div>
                {!shouldHideTotals && (
                  <div className="flex justify-between text-sm py-1 pt-2 border-t mt-1" style={{ borderColor: "var(--border)" }}>
                    <span style={{ color: "var(--muted)" }}>Efectivo esperado</span>
                    <span className="font-black" style={{ color: "#22c55e" }}>
                      ${(shift.openingFloat + (shift.totalCash || 0) - totalExpenses).toFixed(0)}
                    </span>
                  </div>
                )}
              </div>

              <button onClick={closeShift} disabled={closing}
                className="w-full py-4 rounded-2xl font-syne font-black text-base"
                style={{ background: "#ef4444", color: "#fff" }}>
                {closing ? "Cerrando turno..." : "🔒 Cerrar turno definitivamente"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}