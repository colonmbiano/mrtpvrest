"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { apiOrQueue } from "@/lib/offline";

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
  transferVerified: boolean;
  transferVerifiedAt: string | null;
  customer: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  createdAt: string;
};

type ShippingVariant = { variant: string; count: number; amount: number };

type OrdersSummary = {
  count: number;
  total: number;
  deliveryFees: number;
  tips: number;
  byMethod: Record<string, number>;
  unverifiedTransferCount?: number;
  unverifiedTransferTotal?: number;
  // Desglose de envíos por variante/zona del turno (Lluvia, Noche, local…).
  shippingTotal?: number;
  shippingByVariant?: ShippingVariant[];
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
  // Corrección de método de pago: qué pedido tiene abierto el selector y si
  // hay una corrección en vuelo (bloquea los botones para evitar doble envío).
  const [correctingFor, setCorrectingFor] = useState<string | null>(null);
  const [savingMethod, setSavingMethod] = useState(false);

  // Form state
  const [type, setType] = useState<"INCOME" | "EXPENSE" | "RETURN">("EXPENSE");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");

  // Asignar fondo de cambio al repartidor (solo roles financieros). El origen
  // decide si sale del cajón del local ("CAJA" → se refleja en el turno) o si es
  // efectivo externo que el repartidor trae ("EXTERNO" → no toca la caja).
  const [floatAmount, setFloatAmount] = useState("");
  const [floatDesc, setFloatDesc] = useState("");
  const [floatSource, setFloatSource] = useState<"CAJA" | "EXTERNO">("CAJA");
  const [assigningFloat, setAssigningFloat] = useState(false);

  // Inventariar compras del repartidor (entrada de stock, SIN dinero). El gasto
  // ya está en su corte; esto solo suma al inventario. Offline-first vía
  // apiOrQueue (Idempotency-Key) — el backend es idempotente por movementId.
  const [ingredients, setIngredients] = useState<Array<{ id: string; name: string; unit?: string }>>([]);
  const [invFor, setInvFor] = useState<string | null>(null);
  const [invLines, setInvLines] = useState<Array<{ ingredientId: string; qty: string }>>([{ ingredientId: "", qty: "" }]);
  const [invSaving, setInvSaving] = useState(false);
  const [invDone, setInvDone] = useState<Set<string>>(new Set());

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

  // Set de pedidos cuya verificación de transferencia está en vuelo (evita
  // doble tap mientras responde el backend).
  const [verifyingIds, setVerifyingIds] = useState<Set<string>>(new Set());

  // Verificar / desverificar el cobro por transferencia de un pedido. El admin
  // confirma contra su banco que el SPEI llegó. Optimista: actualiza la fila al
  // instante y revierte si el backend falla.
  async function toggleTransferVerified(o: DriverOrder) {
    if (!driver || verifyingIds.has(o.id)) return;
    const next = !o.transferVerified;
    setVerifyingIds((p) => new Set(p).add(o.id));
    setOrders((prev) =>
      prev.map((x) => (x.id === o.id ? { ...x, transferVerified: next } : x)),
    );
    setOrdersSummary((s) =>
      s
        ? {
            ...s,
            unverifiedTransferCount: Math.max(0, (s.unverifiedTransferCount || 0) + (next ? -1 : 1)),
            unverifiedTransferTotal: Math.max(0, (s.unverifiedTransferTotal || 0) + (next ? -o.total : o.total)),
          }
        : s,
    );
    try {
      await api.patch(`/api/driver-cash/${driver.id}/orders/${o.id}/verify-transfer`, { verified: next });
    } catch (e) {
      console.error(e);
      // Revertir
      setOrders((prev) =>
        prev.map((x) => (x.id === o.id ? { ...x, transferVerified: !next } : x)),
      );
      alert("No se pudo actualizar la verificación. Intenta de nuevo.");
    } finally {
      setVerifyingIds((p) => { const n = new Set(p); n.delete(o.id); return n; });
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

  // Asigna fondo de cambio al repartidor (movimiento FLOAT). El backend valida
  // rol admin; el origen ("CAJA"/"EXTERNO") decide si afecta el turno de caja.
  async function handleAssignFloat(e: React.FormEvent) {
    e.preventDefault();
    if (!driver || !floatAmount || isNaN(Number(floatAmount)) || Number(floatAmount) <= 0) return;
    try {
      setAssigningFloat(true);
      await api.post(`/api/driver-cash/${driver.id}/float`, {
        amount: Number(floatAmount),
        description: floatDesc,
        source: floatSource,
      });
      setFloatAmount("");
      setFloatDesc("");
      fetchMovements();
      onRefresh();
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { error?: string } } };
      alert(e2?.response?.data?.error || "No se pudo asignar el fondo");
    } finally {
      setAssigningFloat(false);
    }
  }

  // Corrige el método de pago de un pedido YA cobrado (p. ej. el repartidor
  // cobró en efectivo pero se registró como transferencia). El backend ajusta
  // la caja del repartidor en la misma transacción: si pasa a efectivo, ese
  // monto entra como ingreso a su corte; si deja de serlo, se retira (salvo que
  // el corte ya esté cerrado, donde avisa con `cashAdjusted: 'locked'`).
  async function correctPaymentMethod(order: DriverOrder, method: string) {
    if (savingMethod) return;
    setSavingMethod(true);
    try {
      const { data } = await api.put(`/api/orders/${order.id}/correct-payment-method`, {
        paymentMethod: method,
      });
      // Refleja el cambio en la fila sin re-fetch inmediato.
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id ? { ...o, paymentMethod: method, cashCollected: method === "CASH" } : o,
        ),
      );
      setCorrectingFor(null);
      // La caja cambió: recargar movimientos/resumen del repartidor y el panel.
      fetchMovements();
      fetchOrders();
      onRefresh();
      if (data?.cashAdjusted === "locked") {
        alert(
          "Método corregido. Aviso: el corte de este repartidor ya estaba cerrado, " +
            "así que la caja no se ajustó automáticamente. Ajústalo a mano si aplica.",
        );
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      alert(err?.response?.data?.error || "No se pudo corregir el método de pago");
    } finally {
      setSavingMethod(false);
    }
  }

  // Catálogo de insumos (una vez) para inventariar las compras del repartidor.
  useEffect(() => {
    let cancelled = false;
    api.get("/api/purchases/lookup/ingredients")
      .then((r) => { if (!cancelled) setIngredients(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { /* sin inventario: el botón no aparece útil, no rompe */ });
    return () => { cancelled = true; };
  }, []);

  function openInventory(mId: string) {
    setInvFor((cur) => (cur === mId ? null : mId));
    setInvLines([{ ingredientId: "", qty: "" }]);
  }
  function setLine(i: number, patch: Partial<{ ingredientId: string; qty: string }>) {
    setInvLines((prev) => prev.map((l, li) => (li === i ? { ...l, ...patch } : l)));
  }
  async function submitInventory(mId: string) {
    const items = invLines
      .filter((l) => l.ingredientId && Number(l.qty) > 0)
      .map((l) => ({ ingredientId: l.ingredientId, qty: Number(l.qty) }));
    if (items.length === 0) { alert("Agrega al menos un insumo con cantidad"); return; }
    setInvSaving(true);
    // Offline-first: si no hay red, se encola y sincroniza luego (idempotente).
    const res = await apiOrQueue("adjustment", "POST", "/api/driver-cash/inventory-in", { movementId: mId, items });
    setInvSaving(false);
    if (res.ok) {
      setInvDone((prev) => new Set(prev).add(mId));
      setInvFor(null);
    } else {
      alert(res.error || "No se pudo inventariar");
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
              className="relative py-3 px-4 text-xs font-semibold uppercase tracking-widest transition-colors"
              style={{ color: tab === t.key ? "var(--text-primary)" : "var(--text-secondary)" }}
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
            <h3 className="text-xs font-semibold uppercase tracking-widest text-white/40">Registrar Nuevo</h3>
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
              className="w-full py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-transform active:scale-95 disabled:opacity-50"
              style={{ background: accent, color: "var(--brand-fg)" }}
            >
              {adding ? "Registrando..." : "Guardar Movimiento"}
            </button>
          </form>

          {/* Asignar fondo de cambio (solo roles financieros — backend exige admin) */}
          {canCut && (
            <form onSubmit={handleAssignFloat} className="space-y-4 bg-[var(--surf2)] p-4 rounded-2xl border border-[var(--border)]">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-white/40">Asignar fondo de cambio</h3>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase ml-1">Origen del efectivo</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: "CAJA", label: "🏪 Desde caja", hint: "Sale del cajón del local" },
                    { value: "EXTERNO", label: "💵 Desde fuera", hint: "No toca la caja" },
                  ] as const).map((opt) => {
                    const active = floatSource === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFloatSource(opt.value)}
                        className="rounded-xl px-3 py-2 text-left border transition-colors"
                        style={{
                          background: active ? "color-mix(in srgb, var(--warning) 14%, transparent)" : "var(--bg)",
                          borderColor: active ? "var(--warning)" : "var(--border)",
                        }}
                      >
                        <div className="text-sm font-bold text-white">{opt.label}</div>
                        <div className="text-[10px] text-[var(--text-secondary)]">{opt.hint}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1 space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase ml-1">Monto ($)</label>
                  <input
                    type="number"
                    value={floatAmount}
                    onChange={(e) => setFloatAmount(e.target.value)}
                    placeholder="0"
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-white outline-none"
                    required
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase ml-1">Descripción (opcional)</label>
                  <input
                    type="text"
                    value={floatDesc}
                    onChange={(e) => setFloatDesc(e.target.value)}
                    placeholder="Ej: cambio para el turno"
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-white outline-none"
                  />
                </div>
              </div>

              <p className="text-[10px] text-[var(--text-secondary)] ml-1">
                {floatSource === "CAJA"
                  ? "Se descuenta de la caja del local (entra como movimiento de caja en el turno abierto)."
                  : "Efectivo externo: solo cuadra el corte del repartidor, no afecta la caja del local."}
              </p>

              <button
                type="submit"
                disabled={assigningFloat}
                className="w-full py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-transform active:scale-95 disabled:opacity-50"
                style={{ background: "var(--warning)", color: "var(--brand-fg)" }}
              >
                {assigningFloat ? "Asignando…" : "Asignar fondo"}
              </button>
            </form>
          )}

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
                className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-widest transition-transform active:scale-95 disabled:opacity-40"
                style={{ background: accent, color: "var(--brand-fg)" }}
              >
                {cutting ? "Cerrando corte…" : movements.length === 0 ? "Sin movimientos para cortar" : "Cerrar corte del repartidor"}
              </button>
            </div>
          )}

          {/* Lista de Movimientos */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-white/40 ml-1">Pendiente de corte</h3>
            {loading ? (
              <p className="text-sm text-[var(--text-secondary)] animate-pulse">Cargando movimientos...</p>
            ) : movements.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)] italic">Sin movimientos pendientes de corte.</p>
            ) : (
              <div className="space-y-2">
                {movements.map((m) => {
                  const canInv = m.type === 'EXPENSE' && m.category === 'COMPRAS';
                  const done = invDone.has(m.id);
                  return (
                  <div
                    key={m.id}
                    className="rounded-xl bg-[var(--surf2)] border border-[var(--border)] overflow-hidden"
                  >
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 ${
                            m.type === 'INCOME' ? 'bg-green-500/10 text-green-400' :
                            m.type === 'EXPENSE' ? 'bg-red-500/10 text-red-400' :
                            m.type === 'FLOAT' ? '' :
                            'bg-blue-500/10 text-blue-400'
                          }`}
                          style={m.type === 'FLOAT' ? { color: "var(--warning)", background: "color-mix(in srgb, var(--warning) 12%, transparent)" } : undefined}
                        >
                          {m.type === 'INCOME' ? '↑' : m.type === 'EXPENSE' ? '↓' : m.type === 'FLOAT' ? '$' : '↺'}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{m.description || m.category}</div>
                          <div className="text-[10px] text-[var(--text-secondary)]">{new Date(m.createdAt).toLocaleTimeString()}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {canInv && (done ? (
                          <span className="text-[9px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-green-500/10 text-green-400 border border-green-500/20">✓ Inventariado</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openInventory(m.id)}
                            className="text-[9px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-white/5 text-white/70 border border-white/10 hover:text-white active:scale-95"
                          >📦 Inventariar</button>
                        ))}
                        <div
                          className={`text-sm font-semibold ${
                            m.type === 'INCOME' ? 'text-green-400' :
                            m.type === 'EXPENSE' ? 'text-red-400' :
                            m.type === 'FLOAT' ? '' :
                            'text-blue-400'
                          }`}
                          style={m.type === 'FLOAT' ? { color: "var(--warning)" } : undefined}
                        >
                          {m.type === 'EXPENSE' ? '-' : ''}${m.amount.toFixed(0)}
                        </div>
                      </div>
                    </div>

                    {invFor === m.id && !done && (
                      <div className="border-t border-[var(--border)] p-3 space-y-2 bg-[var(--bg)]">
                        <div className="text-[9px] font-semibold uppercase tracking-widest text-white/40">¿Qué insumos entraron? (suma al inventario, no toca el dinero)</div>
                        {invLines.map((l, i) => (
                          <div key={i} className="flex gap-2">
                            <select
                              value={l.ingredientId}
                              onChange={(e) => setLine(i, { ingredientId: e.target.value })}
                              className="flex-1 bg-[var(--surf2)] border border-[var(--border)] rounded-lg px-2 py-2 text-xs text-white outline-none"
                            >
                              <option value="">Insumo…</option>
                              {ingredients.map((ing) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
                            </select>
                            <input
                              type="number"
                              value={l.qty}
                              onChange={(e) => setLine(i, { qty: e.target.value })}
                              placeholder="Cant."
                              className="w-20 bg-[var(--surf2)] border border-[var(--border)] rounded-lg px-2 py-2 text-xs text-white outline-none"
                            />
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setInvLines((prev) => [...prev, { ingredientId: "", qty: "" }])}
                            className="text-[10px] font-bold px-3 py-2 rounded-lg border border-[var(--border)] text-white/60 hover:text-white"
                          >+ línea</button>
                          <button
                            type="button"
                            onClick={() => submitInventory(m.id)}
                            disabled={invSaving}
                            className="flex-1 py-2 rounded-lg font-black text-xs uppercase tracking-widest active:scale-95 disabled:opacity-50"
                            style={{ background: accent, color: "var(--brand-fg)" }}
                          >{invSaving ? "Guardando…" : "Guardar en inventario"}</button>
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
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
                      <div className="text-base font-black" style={{ color: method === "CASH" ? "var(--success)" : "var(--text-primary)" }}>
                        ${amount.toFixed(0)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Aviso: transferencias del turno aún sin verificar contra el banco */}
              {!!ordersSummary?.unverifiedTransferCount && (
                <div
                  className="flex items-center gap-2 p-3 rounded-2xl border"
                  style={{ background: "color-mix(in srgb, var(--warning) 10%, transparent)", borderColor: "color-mix(in srgb, var(--warning) 25%, transparent)" }}
                >
                  <span className="text-base">⚠️</span>
                  <div className="text-[11px] font-bold leading-tight" style={{ color: "var(--warning)" }}>
                    {ordersSummary.unverifiedTransferCount} transferencia
                    {ordersSummary.unverifiedTransferCount === 1 ? "" : "s"} sin verificar
                    {" · "}${(ordersSummary.unverifiedTransferTotal || 0).toFixed(0)}
                    <div className="text-[10px] font-medium opacity-70 mt-0.5">
                      Confírmalas contra tu banco y palomea cada una abajo.
                    </div>
                  </div>
                </div>
              )}

              {/* Envíos por variante/zona del turno (Lluvia, Noche, local…).
                  La variante se lee de las notas del renglón de envío server-side. */}
              {ordersSummary?.shippingByVariant && ordersSummary.shippingByVariant.length > 0 && (
                <div className="rounded-2xl bg-[var(--surf2)] border border-[var(--border)] p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-white/40">🛵 Envíos por variante</h3>
                    <span className="text-sm font-black text-white tabular-nums">${(ordersSummary.shippingTotal ?? 0).toFixed(0)}</span>
                  </div>
                  <div className="space-y-1.5">
                    {ordersSummary.shippingByVariant.map((v) => (
                      <div key={v.variant} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-white/80 truncate capitalize">{v.variant}</span>
                        <span className="flex items-center gap-3 shrink-0">
                          <span className="text-[var(--text-secondary)] tabular-nums">×{v.count}</span>
                          <span className="font-semibold text-white tabular-nums w-14 text-right">${v.amount.toFixed(0)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lista de pedidos */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-white/40 ml-1">Pedidos del turno (pendientes de corte)</h3>
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
                            <div className="text-xs font-semibold text-white truncate">
                              {o.customer || "Público General"}
                            </div>
                            <div className="text-[10px] text-[var(--text-secondary)]">
                              {o.orderNumber} · {new Date(o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-semibold text-white">${o.total.toFixed(0)}</div>
                            <div
                              className="text-[10px] font-bold"
                              style={{ color: o.paymentMethod === "CASH" ? "var(--success)" : "var(--text-secondary)" }}
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
                          <div
                            className="mt-1.5 inline-block text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                            style={{ color: "var(--warning)", background: "color-mix(in srgb, var(--warning) 12%, transparent)", borderColor: "color-mix(in srgb, var(--warning) 25%, transparent)" }}
                          >
                            Efectivo sin liquidar
                          </div>
                        )}
                        {/* Verificación de transferencia: el admin palomea que el
                            SPEI llegó a su banco. Solo para pedidos por transferencia. */}
                        {o.paymentMethod === "TRANSFER" && (
                          <div className="mt-2 flex items-center justify-between gap-2">
                            {o.transferVerified ? (
                              <span
                                className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                                style={{ color: "var(--success)", background: "color-mix(in srgb, var(--success) 12%, transparent)", borderColor: "color-mix(in srgb, var(--success) 25%, transparent)" }}
                              >
                                ✓ Transferencia verificada
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                                style={{ color: "var(--warning)", background: "color-mix(in srgb, var(--warning) 12%, transparent)", borderColor: "color-mix(in srgb, var(--warning) 25%, transparent)" }}
                              >
                                Transferencia sin verificar
                              </span>
                            )}
                            {canCut && (
                              <button
                                onClick={() => toggleTransferVerified(o)}
                                disabled={verifyingIds.has(o.id)}
                                className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg border active:scale-95 transition-transform disabled:opacity-50"
                                style={
                                  o.transferVerified
                                    ? { borderColor: "var(--border)", color: "var(--text-secondary)" }
                                    : { borderColor: "var(--success)", color: "var(--success)", background: "color-mix(in srgb, var(--success) 8%, transparent)" }
                                }
                              >
                                {verifyingIds.has(o.id)
                                  ? "..."
                                  : o.transferVerified
                                    ? "Desmarcar"
                                    : "Verificar ✓"}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Corregir método de pago: para cuando el repartidor
                            cobró distinto a lo registrado (efectivo ↔ transfer).
                            Ajusta también la caja del repartidor en el backend. */}
                        <div className="mt-2 pt-2 border-t border-[var(--border)]">
                          {correctingFor === o.id ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mr-0.5">
                                Cobrado como:
                              </span>
                              {(["CASH", "TRANSFER", "CARD"] as const)
                                .filter((m) => m !== o.paymentMethod)
                                .map((m) => (
                                  <button
                                    key={m}
                                    type="button"
                                    onClick={() => correctPaymentMethod(o, m)}
                                    disabled={savingMethod}
                                    className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border active:scale-95 transition-transform disabled:opacity-50"
                                    style={{ borderColor: accent, color: accent, background: `${accent}14` }}
                                  >
                                    {PAYMENT_LABELS[m]}
                                  </button>
                                ))}
                              <button
                                type="button"
                                onClick={() => setCorrectingFor(null)}
                                disabled={savingMethod}
                                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg text-[var(--text-secondary)] hover:text-white disabled:opacity-50"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setCorrectingFor(o.id)}
                              className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-white transition-colors"
                            >
                              ✏️ Corregir método de pago
                            </button>
                          )}
                        </div>
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
