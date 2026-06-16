"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";

type Movement = {
  id: string;
  type: "INCOME" | "EXPENSE" | "RETURN" | "FLOAT";
  category: string;
  amount: number;
  description: string | null;
  createdAt: string;
};

type DriverOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string | null;
  paymentStatus: string | null;
  total: number;
  deliveryFee: number | null;
  tip: number | null;
  cashCollected: boolean;
  customer: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  createdAt: string;
};

type OrdersSummary = {
  count: number;
  total: number;
  deliveryFees: number;
  tips: number;
  byMethod: Record<string, number>;
};

type CashSummary = {
  float: number;
  income: number;
  expense: number;
  returned: number;
  balance: number;
};

type Props = {
  driver: { id: string; name: string } | null;
  onClose: () => void;
  onRefresh: () => void;
  accent: string;
  // Quién puede ejecutar el corte (cerrar la caja del repartidor). El backend
  // exige rol ADMIN/OWNER/MANAGER; sin esto el botón daría 403.
  canCut?: boolean;
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CARD: "Tarjeta",
  OTHER: "Otro",
};

export default function DriverMovementsModal({ driver, onClose, onRefresh, accent, canCut }: Props) {
  const [tab, setTab] = useState<"movimientos" | "pedidos">("movimientos");
  const [movements, setMovements] = useState<Movement[]>([]);
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [cutting, setCutting] = useState(false);
  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [ordersSummary, setOrdersSummary] = useState<OrdersSummary | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  // Form state
  const [type, setType] = useState<"INCOME" | "EXPENSE" | "RETURN">("EXPENSE");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");

  // Categorías canónicas — mismas que la app de delivery y el catálogo de gastos
  // (OperatingExpenseCategory), para que repartidor/turno/reportes coincidan.
  const categories = [
    { value: "GASOLINA", label: "⛽ Gasolina" },
    { value: "COMPRAS", label: "🛒 Compras / Insumos" },
    { value: "MANTENIMIENTO", label: "🔧 Mantenimiento" },
    { value: "CASETAS", label: "🛣️ Casetas / Peaje" },
    { value: "OTROS", label: "📝 Otros" },
  ];

  async function fetchMovements() {
    if (!driver) return;
    try {
      setLoading(true);
      const { data } = await api.get(`/api/driver-cash/${driver.id}/movements`);
      setMovements(data.movements);
      setSummary(data.summary || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchOrders() {
    if (!driver) return;
    try {
      setLoadingOrders(true);
      const { data } = await api.get(`/api/driver-cash/${driver.id}/orders`);
      setOrders(data.orders || []);
      setOrdersSummary(data.summary || null);
      setOrdersLoaded(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingOrders(false);
    }
  }

  useEffect(() => {
    if (!driver) return;
    let cancelled = false;
    // Arranque diferido (ver impresoras): evita set-state-in-effect.
    queueMicrotask(() => { if (!cancelled) fetchMovements(); });
    return () => { cancelled = true; };
  }, [driver]);

  // Carga diferida de pedidos: solo al abrir la pestaña por primera vez.
  // Arranque diferido a microtask (ver fetchMovements arriba): fetchOrders
  // hace setLoadingOrders síncrono y dispara set-state-in-effect en el lint.
  useEffect(() => {
    if (!(tab === "pedidos" && !ordersLoaded && !loadingOrders)) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) fetchOrders(); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function handleAddMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!driver || !amount || isNaN(Number(amount))) return;
    if (!category) { alert("Selecciona una categoría"); return; }

    try {
      setAdding(true);
      await api.post(`/api/driver-cash/${driver.id}/movements`, {
        type,
        category,
        amount: Number(amount),
        description,
      });
      setAmount("");
      setDescription("");
      setCategory("");
      fetchMovements();
      onRefresh();
    } catch {
      alert("Error al registrar movimiento");
    } finally {
      setAdding(false);
    }
  }

  // Cierra la caja del repartidor: aprueba TODOS los movimientos pendientes y
  // genera su DriverCashCut (el backend recalcula los totales, no confía en el
  // cliente). Tras el corte la lista queda vacía y se refresca el panel.
  async function handleCut() {
    if (!driver || !movements.length) return;
    const bal = summary?.balance ?? 0;
    if (!window.confirm(
      `¿Cerrar el corte de ${driver.name}?\n\n` +
      `Entrega en caja: $${bal.toFixed(0)}\n` +
      `Movimientos: ${movements.length}\n\n` +
      `Se aprueban todos los movimientos pendientes. No se puede deshacer.`
    )) return;
    try {
      setCutting(true);
      await api.post(`/api/driver-cash/${driver.id}/cut`, {});
      await fetchMovements();
      onRefresh();
      alert(`Corte realizado. Balance entregado: $${bal.toFixed(0)}`);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      alert(err?.response?.data?.error || "No se pudo realizar el corte");
    } finally {
      setCutting(false);
    }
  }

  if (!driver) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg bg-[var(--surf)] border border-[var(--border)] rounded-[2rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        <div className="p-6 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg)]">
          <div>
            <h2 className="text-xl font-black text-white">💰 Caja del Repartidor</h2>
            <p className="text-xs font-bold" style={{ color: accent }}>{driver.name}</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-white text-2xl">✕</button>
        </div>

        {/* Pestañas */}
        <div className="flex border-b border-[var(--border)] bg-[var(--bg)] px-6">
          {([
            { key: "movimientos", label: "Movimientos" },
            { key: "pedidos", label: "Pedidos del turno" },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="relative py-3 px-4 text-xs font-black uppercase tracking-widest transition-colors"
              style={{ color: tab === t.key ? "#fff" : "var(--text-secondary)" }}
            >
              {t.label}
              {tab === t.key && (
                <span
                  className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full"
                  style={{ background: accent }}
                />
              )}
            </button>
          ))}
        </div>

        {tab === "movimientos" && (
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Formulario */}
          <form onSubmit={handleAddMovement} className="space-y-4 bg-[var(--surf2)] p-4 rounded-2xl border border-[var(--border)]">
            <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Registrar Nuevo</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase ml-1">Tipo</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="EXPENSE">🔻 Gasto / Salida</option>
                  <option value="INCOME">🔺 Ingreso / Entrada</option>
                  <option value="RETURN">🔄 Devolución</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase ml-1">Categoría</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="" disabled>Selecciona…</option>
                  {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1 space-y-1">
                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase ml-1">Monto ($)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-white outline-none"
                  required
                />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase ml-1">Descripción / Incidencia</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej: Gasolina, Ponchadura..."
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-white outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={adding}
              className="w-full py-3 rounded-xl font-black text-sm uppercase tracking-widest text-black transition-transform active:scale-95 disabled:opacity-50"
              style={{ background: accent }}
            >
              {adding ? "Registrando..." : "Guardar Movimiento"}
            </button>
          </form>

          {/* Balance + corte: cerrar la caja del repartidor (solo roles financieros) */}
          {canCut && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-[var(--surf2)] border border-[var(--border)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Balance a entregar</div>
                <div className="text-2xl font-black text-white tabular-nums">${(summary?.balance ?? 0).toFixed(0)}</div>
                <div className="text-[10px] text-[var(--text-secondary)] mt-1">
                  Fondo ${(summary?.float ?? 0).toFixed(0)} + Cobrado ${(summary?.income ?? 0).toFixed(0)} − Gastos ${(summary?.expense ?? 0).toFixed(0)}
                  {(summary?.returned ?? 0) > 0 ? ` − Devol. $${(summary?.returned ?? 0).toFixed(0)}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCut}
                disabled={cutting || movements.length === 0}
                className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-widest text-black transition-transform active:scale-95 disabled:opacity-40"
                style={{ background: accent }}
              >
                {cutting ? "Cerrando corte…" : movements.length === 0 ? "Sin movimientos para cortar" : "Cerrar corte del repartidor"}
              </button>
            </div>
          )}

          {/* Lista de Movimientos */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-white/40 ml-1">Pendiente de corte</h3>
            {loading ? (
              <p className="text-sm text-[var(--text-secondary)] animate-pulse">Cargando movimientos...</p>
            ) : movements.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)] italic">Sin movimientos pendientes de corte.</p>
            ) : (
              <div className="space-y-2">
                {movements.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--surf2)] border border-[var(--border)]"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                        m.type === 'INCOME' ? 'bg-green-500/10 text-green-400' :
                        m.type === 'EXPENSE' ? 'bg-red-500/10 text-red-400' :
                        m.type === 'FLOAT' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-blue-500/10 text-blue-400'
                      }`}>
                        {m.type === 'INCOME' ? '↑' : m.type === 'EXPENSE' ? '↓' : m.type === 'FLOAT' ? '$' : '↺'}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">{m.description || m.category}</div>
                        <div className="text-[10px] text-[var(--text-secondary)]">{new Date(m.createdAt).toLocaleTimeString()}</div>
                      </div>
                    </div>
                    <div className={`text-sm font-black ${
                      m.type === 'INCOME' ? 'text-green-400' :
                      m.type === 'EXPENSE' ? 'text-red-400' :
                      m.type === 'FLOAT' ? 'text-amber-400' :
                      'text-blue-400'
                    }`}>
                      {m.type === 'EXPENSE' ? '-' : ''}${m.amount.toFixed(0)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        )}

        {tab === "pedidos" && (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loadingOrders ? (
            <p className="text-sm text-[var(--text-secondary)] animate-pulse">Cargando pedidos...</p>
          ) : (
            <>
              {/* Resumen */}
              {ordersSummary && ordersSummary.count > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-2xl bg-[var(--surf2)] border border-[var(--border)]">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Pedidos</div>
                    <div className="text-xl font-black text-white">{ordersSummary.count}</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-[var(--surf2)] border border-[var(--border)]">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Total vendido</div>
                    <div className="text-xl font-black text-white">${ordersSummary.total.toFixed(0)}</div>
                  </div>
                  {Object.entries(ordersSummary.byMethod).map(([method, amount]) => (
                    <div key={method} className="p-3 rounded-2xl bg-[var(--surf2)] border border-[var(--border)]">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">
                        {PAYMENT_LABELS[method] || method}
                      </div>
                      <div className="text-base font-black" style={{ color: method === "CASH" ? "#88D66C" : "#fff" }}>
                        ${amount.toFixed(0)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Lista de pedidos */}
              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-white/40 ml-1">Pedidos del turno (pendientes de corte)</h3>
                {orders.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)] italic">No hay pedidos en el turno actual.</p>
                ) : (
                  <div className="space-y-2">
                    {orders.map((o) => (
                      <div
                        key={o.id}
                        className="p-3 rounded-xl bg-[var(--surf2)] border border-[var(--border)]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-black text-white truncate">
                              {o.customer || "Público General"}
                            </div>
                            <div className="text-[10px] text-[var(--text-secondary)]">
                              {o.orderNumber} · {new Date(o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-black text-white">${o.total.toFixed(0)}</div>
                            <div
                              className="text-[10px] font-bold"
                              style={{ color: o.paymentMethod === "CASH" ? "#88D66C" : "var(--text-secondary)" }}
                            >
                              {PAYMENT_LABELS[o.paymentMethod || "OTHER"] || o.paymentMethod}
                            </div>
                          </div>
                        </div>
                        {(o.deliveryAddress || o.customerPhone) && (
                          <div className="mt-1.5 text-[10px] text-[var(--text-secondary)] truncate">
                            {[o.customerPhone, o.deliveryAddress].filter(Boolean).join(" · ")}
                          </div>
                        )}
                        {o.paymentMethod === "CASH" && !o.cashCollected && (
                          <div className="mt-1.5 inline-block text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Efectivo sin liquidar
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        )}

        <div className="p-4 border-t border-[var(--border)] bg-[var(--bg)] flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl text-xs font-bold text-[var(--text-secondary)] hover:text-white transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
