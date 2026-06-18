"use client";
import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  Receipt,
  Printer,
  Banknote,
  ChefHat,
  Pencil,
  Plus,
  Minus,
  Trash2,
  Check,
  Bike,
  Repeat,
  ArrowRightLeft,
  Maximize2,
  Minimize2,
  SplitSquareHorizontal,
  CheckCircle2,
  Circle,
  Users,
  Package,
  ShoppingCart,
} from "lucide-react";

export interface OrderDetailItem {
  /** itemId del backend (OrderItem.id). Requerido para editar/eliminar/dividir. */
  id?: string;
  name: string;
  quantity: number;
  subtotal: number;
  notes?: string | null;
  /** Comensal (asiento) al que pertenece el item; usado para dividir por comensal. */
  seatNumber?: number | null;
}

interface OrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderNumber: string;
  /** Etiqueta editable de la cuenta (p. ej. "Mesa terraza", "Cumpleaños Ana"). */
  ticketName?: string | null;
  customerName?: string | null;
  tableName?: string | null;
  orderType?: string | null;
  status?: string | null;
  total: number;
  subtotal?: number;
  discount?: number;
  createdAt?: string | null;
  items: OrderDetailItem[];
  /** Reimprime ticket de cuenta a impresoras CASHIER. */
  onReprint?: () => void;
  /** Reimprime comanda completa a impresoras KITCHEN/BAR. */
  onReprintKitchen?: () => void;
  onCharge?: () => void;
  /** Cancela la orden completa (status=CANCELLED). Solo admin/manager. */
  onCancelOrder?: () => void;
  /** Abre el flujo de asignación de repartidor. Solo para DELIVERY. */
  onAssignDriver?: () => void;
  /** Si se provee, habilita el modo edición — admin puede cambiar
   *  cantidad/notas o eliminar items de la orden abierta. */
  onUpdateItem?: (itemId: string, patch: { quantity?: number; notes?: string }) => Promise<void> | void;
  onDeleteItem?: (itemId: string) => Promise<void> | void;
  /** Estado del item actualmente en update — bloquea botones para evitar
   *  doble envío. */
  updatingItemId?: string | null;
  /** Si se provee, abre el flujo de mover/fusionar la cuenta. */
  onMergeOrTransfer?: () => void;
  /** Si se provee, abre el flujo de cambiar el tipo de orden
   *  (MESA ↔ LLEVAR ↔ DOMICILIO). */
  onChangeType?: () => void;
  /** Si se provee, habilita renombrar la cuenta abierta. */
  onRename?: (name: string) => Promise<void> | void;
  /** Si se provee, habilita dividir la cuenta: recibe los itemIds que se
   *  mueven a un nuevo ticket. La cuenta original conserva el resto. */
  onSplit?: (itemIds: string[]) => Promise<void> | void;
  /** Si se provee, reabre la orden en el menú para agregar más productos
   *  (nueva ronda sobre la misma cuenta abierta). */
  onAddProducts?: () => void;
}

const formatTime = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

const EXPAND_KEY = "tpv-order-detail-expanded";
type SplitMethod = "product" | "seat";
const seatKeyOf = (it: OrderDetailItem): number | "shared" =>
  typeof it.seatNumber === "number" ? it.seatNumber : "shared";

const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  isOpen,
  onClose,
  orderNumber,
  ticketName,
  customerName,
  tableName,
  orderType,
  status,
  total,
  subtotal,
  discount,
  createdAt,
  items,
  onReprint,
  onReprintKitchen,
  onCharge,
  onCancelOrder,
  onAssignDriver,
  onUpdateItem,
  onDeleteItem,
  updatingItemId,
  onMergeOrTransfer,
  onChangeType,
  onRename,
  onSplit,
  onAddProducts,
}) => {
  const [editing, setEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState<{ id: string; value: string } | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Rename
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Split
  const [splitMode, setSplitMode] = useState(false);
  const [splitMethod, setSplitMethod] = useState<SplitMethod>("product");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [splitting, setSplitting] = useState(false);

  // Preferencia de tamaño persistida. Diferido (queueMicrotask) para no
  // llamar setState síncrono dentro del effect (set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        setExpanded(localStorage.getItem(EXPAND_KEY) === "1");
      } catch { /* localStorage no disponible */ }
    });
    return () => { cancelled = true; };
  }, []);

  const toggleExpanded = () => {
    setExpanded((v) => {
      const next = !v;
      try { localStorage.setItem(EXPAND_KEY, next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  };

  const splittableItems = useMemo(
    () => items.filter((it): it is OrderDetailItem & { id: string } => Boolean(it.id)),
    [items],
  );

  const seatBuckets = useMemo(() => {
    const m = new Map<number | "shared", (OrderDetailItem & { id: string })[]>();
    for (const it of splittableItems) {
      const k = seatKeyOf(it);
      const arr = m.get(k) ?? [];
      arr.push(it);
      m.set(k, arr);
    }
    return m;
  }, [splittableItems]);

  const orderedSeatKeys = useMemo(() => {
    const numeric = Array.from(seatBuckets.keys())
      .filter((k): k is number => typeof k === "number")
      .sort((a, b) => a - b);
    const keys: (number | "shared")[] = [...numeric];
    if (seatBuckets.has("shared")) keys.push("shared");
    return keys;
  }, [seatBuckets]);

  const selectedTotal = useMemo(
    () =>
      splittableItems
        .filter((it) => selected.has(it.id))
        .reduce((s, it) => s + (it.subtotal || 0), 0),
    [splittableItems, selected],
  );

  if (!isOpen) return null;
  const canEditItems = !!(onUpdateItem || onDeleteItem);
  const isDelivery = orderType?.toUpperCase() === "DELIVERY" || orderType?.toUpperCase() === "DOMICILIO";

  const showSubtotalLine =
    typeof subtotal === "number" && Math.abs(subtotal - total) > 0.001;
  const showDiscountLine = typeof discount === "number" && discount > 0;

  const displayTitle = (ticketName && ticketName.trim()) || `#${orderNumber}`;

  // ── Rename ────────────────────────────────────────────────────────────────
  const startEditName = () => {
    setNameDraft(ticketName ?? "");
    setEditingName(true);
  };
  const commitName = async () => {
    if (!onRename || savingName) return;
    setSavingName(true);
    try {
      await onRename(nameDraft.trim());
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  };

  // ── Split ───────────────────────────────────────────────────────────────
  const enterSplit = () => {
    setEditing(false);
    setSelected(new Set());
    setSplitMethod(orderedSeatKeys.length >= 2 ? "seat" : "product");
    setSplitMode(true);
  };
  const exitSplit = () => {
    setSplitMode(false);
    setSelected(new Set());
  };
  const switchMethod = (m: SplitMethod) => {
    setSplitMethod(m);
    setSelected(new Set());
  };
  const toggleItem = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSeat = (key: number | "shared") => {
    const ids = (seatBuckets.get(key) ?? []).map((it) => it.id);
    setSelected((prev) => {
      const next = new Set(prev);
      const allIn = ids.every((id) => next.has(id));
      if (allIn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };
  const selectedCount = selected.size;
  const splitInvalid = selectedCount === 0 || selectedCount === splittableItems.length;
  const confirmSplit = async () => {
    if (!onSplit || splitInvalid || splitting) return;
    setSplitting(true);
    try {
      await onSplit(Array.from(selected));
      exitSplit();
    } finally {
      setSplitting(false);
    }
  };

  const hasActions = !!(
    onReprint || onReprintKitchen || onCharge || onMergeOrTransfer ||
    onChangeType || onCancelOrder || onSplit || onAddProducts ||
    (onAssignDriver && isDelivery)
  );

  const renderItemRow = (it: OrderDetailItem, idx: number) => {
    const itemId = it.id ?? null;
    const updating = !!(itemId && updatingItemId === itemId);
    const editingThis = editing && itemId !== null && !splitMode;
    const noteEditing = noteDraft?.id === itemId;
    const isSelected = !!(itemId && selected.has(itemId));
    const selectableProduct = splitMode && splitMethod === "product" && itemId;

    return (
      <div
        key={itemId ?? idx}
        onClick={selectableProduct ? () => toggleItem(itemId!) : undefined}
        className={`flex flex-col gap-2 p-3 rounded-2xl border transition-colors ${
          splitMode && isSelected
            ? "bg-[var(--brand-soft)] border-[var(--brand)]"
            : "bg-white/[0.03] border-white/5"
        } ${selectableProduct ? "cursor-pointer active:scale-[0.99]" : ""}`}
      >
        <div className="flex justify-between items-start gap-3">
          {splitMode ? (
            <span className="shrink-0 pt-0.5">
              {isSelected ? (
                <CheckCircle2 size={20} className="text-[var(--brand)]" strokeWidth={2.5} />
              ) : (
                <Circle size={20} className="text-white/30" />
              )}
            </span>
          ) : editingThis && onUpdateItem && itemId ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onUpdateItem(itemId, { quantity: Math.max(1, it.quantity - 1) })}
                disabled={updating || it.quantity <= 1}
                aria-label="Restar cantidad"
                className="w-9 h-9 min-h-[36px] rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 active:scale-95 transition-transform disabled:opacity-30"
              >
                <Minus size={14} />
              </button>
              <span className="tabular-nums text-[14px] font-semibold text-[var(--brand)] w-7 text-center">
                {updating ? "…" : it.quantity}
              </span>
              <button
                type="button"
                onClick={() => onUpdateItem(itemId, { quantity: it.quantity + 1 })}
                disabled={updating}
                aria-label="Sumar cantidad"
                className="w-9 h-9 min-h-[36px] rounded-xl bg-[var(--brand-soft)] border border-[var(--brand)] text-[var(--brand)] flex items-center justify-center active:scale-95 transition-transform disabled:opacity-30"
              >
                <Plus size={14} />
              </button>
            </div>
          ) : (
            <span className="text-[13px] font-bold text-[var(--brand)] tabular-nums shrink-0">
              {it.quantity}×
            </span>
          )}

          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-white truncate">{it.name}</div>
            {!noteEditing && it.notes && (
              <div className="text-[11px] font-medium text-white/50 italic truncate mt-1">
                ✎ {it.notes}
              </div>
            )}
          </div>

          <div className="tabular-nums text-[13px] font-semibold text-white shrink-0">
            ${it.subtotal.toFixed(2)}
          </div>

          {editingThis && onDeleteItem && itemId && (
            <button
              type="button"
              onClick={() => onDeleteItem(itemId)}
              disabled={updating}
              aria-label="Eliminar item"
              className="w-9 h-9 min-h-[36px] rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] flex items-center justify-center active:scale-95 transition-transform disabled:opacity-30 shrink-0"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {editingThis && onUpdateItem && itemId && (
          noteEditing ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={noteDraft!.value}
                onChange={(e) => setNoteDraft({ id: itemId, value: e.target.value.slice(0, 200) })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onUpdateItem(itemId, { notes: noteDraft!.value });
                    setNoteDraft(null);
                  }
                  if (e.key === "Escape") setNoteDraft(null);
                }}
                placeholder="Nota para cocina..."
                className="flex-1 min-w-0 h-9 min-h-[36px] bg-white/5 border border-[var(--brand)] rounded-xl px-3 text-[12px] text-white placeholder:text-white/30 outline-none focus:border-[var(--brand)]"
              />
              <button
                type="button"
                onClick={() => {
                  onUpdateItem(itemId, { notes: noteDraft!.value });
                  setNoteDraft(null);
                }}
                aria-label="Guardar nota"
                className="w-9 h-9 min-h-[36px] rounded-xl bg-[var(--brand)] text-[var(--brand-fg)] flex items-center justify-center active:scale-90 transition-transform"
              >
                <Check size={14} strokeWidth={3} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNoteDraft({ id: itemId, value: it.notes ?? "" })}
              className="self-start text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40 active:text-[var(--brand)] transition-colors"
            >
              {it.notes ? "✎ Editar nota" : "+ Agregar nota"}
            </button>
          )
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* OVERLAY */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* MODAL */}
      <div
        className={`relative w-full flex flex-col bg-[var(--bg)] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${
          expanded ? "max-w-[920px] max-h-[94vh]" : "max-w-[560px] max-h-[88vh]"
        }`}
      >
        {/* Ambient warm-tech glow */}
        <div
          aria-hidden
          className="absolute pointer-events-none -top-24 -right-24 w-72 h-72 rounded-full opacity-30 blur-[80px]"
          style={{
            background:
              "radial-gradient(circle, var(--brand-glow) 0%, transparent 70%)",
          }}
        />

        {/* HEADER */}
        <div className="relative z-10 p-5 border-b border-white/5 bg-white/5 backdrop-blur-md flex items-center gap-3 shrink-0">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--brand-soft)] text-[var(--brand)] border border-[var(--brand)] shrink-0">
            <Receipt size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase">
              Detalle ticket
            </span>
            {editingName ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value.slice(0, 60))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitName();
                    if (e.key === "Escape") setEditingName(false);
                  }}
                  placeholder="Nombre de la cuenta…"
                  className="flex-1 min-w-0 h-9 min-h-[36px] bg-white/5 border border-[var(--brand)] rounded-xl px-3 text-[15px] font-semibold text-white placeholder:text-white/30 placeholder:font-bold outline-none focus:border-[var(--brand)]"
                />
                <button
                  type="button"
                  onClick={commitName}
                  disabled={savingName}
                  aria-label="Guardar nombre"
                  className="w-9 h-9 min-h-[36px] rounded-xl bg-[var(--brand)] text-[var(--brand-fg)] flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50 shrink-0"
                >
                  <Check size={16} strokeWidth={3} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-[18px] font-black text-white truncate leading-none">
                  {displayTitle}
                </h3>
                {onRename && (
                  <button
                    type="button"
                    onClick={startEditName}
                    aria-label="Renombrar cuenta"
                    className="shrink-0 w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/50 active:text-[var(--brand)] active:scale-95 transition-all"
                  >
                    <Pencil size={13} />
                  </button>
                )}
              </div>
            )}
            <div className="text-[11px] font-bold text-white/40 mt-1 truncate">
              #{orderNumber}
              {orderType && <span className="text-[var(--brand)]"> · {orderType}</span>}
            </div>
          </div>
          <button
            onClick={toggleExpanded}
            aria-label={expanded ? "Reducir" : "Expandir"}
            title={expanded ? "Reducir" : "Expandir"}
            className="w-12 h-12 min-h-[48px] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 active:scale-95 transition-transform shrink-0"
          >
            {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-12 h-12 min-h-[48px] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 active:scale-95 transition-transform shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div
          data-testid="order-detail-scroll"
          className="relative z-10 flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide"
        >
          {/* META */}
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-2 border-b border-white/5">
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-[9px] font-semibold tracking-[0.14em] text-white/40 uppercase mb-1">
                Cliente
              </div>
              <div className="text-[13px] font-bold text-white truncate">
                {customerName || "Público general"}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="text-[9px] font-semibold tracking-[0.14em] text-white/40 uppercase mb-1">
                {tableName ? "Mesa" : "Apertura"}
              </div>
              <div className="text-[13px] font-bold text-white truncate">
                {tableName || formatTime(createdAt)}
              </div>
            </div>
            {status && (
              <div className="col-span-2 sm:col-span-1 p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[9px] font-semibold tracking-[0.14em] text-white/40 uppercase mb-1">
                  Estado
                </div>
                <div className="text-[13px] font-bold text-[#88D66C]">{status}</div>
              </div>
            )}
          </div>

          {/* ITEMS */}
          <div className="p-4 space-y-3">
            {/* Toolbar de productos / split */}
            {splitMode ? (
              <div className="space-y-3 mb-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold tracking-[0.25em] text-[var(--brand)] uppercase">
                    Dividir cuenta
                  </span>
                  <button
                    type="button"
                    onClick={exitSplit}
                    className="min-h-[36px] h-9 px-3 rounded-xl text-[10px] font-semibold uppercase tracking-[0.15em] flex items-center gap-1.5 bg-white/5 border border-white/10 text-white/60 active:scale-95 transition-transform"
                  >
                    <X size={12} /> Cancelar
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => switchMethod("product")}
                    className={`min-h-[40px] h-10 rounded-xl text-[10px] font-semibold uppercase tracking-[0.1em] flex items-center justify-center gap-1.5 transition-colors border ${
                      splitMethod === "product"
                        ? "bg-[var(--brand)] border-[var(--brand)] text-[var(--brand-fg)]"
                        : "bg-white/5 border-white/10 text-white/60"
                    }`}
                  >
                    <Package size={14} /> Por producto
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMethod("seat")}
                    className={`min-h-[40px] h-10 rounded-xl text-[10px] font-semibold uppercase tracking-[0.1em] flex items-center justify-center gap-1.5 transition-colors border ${
                      splitMethod === "seat"
                        ? "bg-[var(--brand)] border-[var(--brand)] text-[var(--brand-fg)]"
                        : "bg-white/5 border-white/10 text-white/60"
                    }`}
                  >
                    <Users size={14} /> Por comensal
                  </button>
                </div>
                <p className="text-[11px] font-medium text-white/45 leading-relaxed">
                  Selecciona lo que pasa al <span className="text-white/70">nuevo ticket</span>; la cuenta
                  actual conserva el resto.
                </p>
              </div>
            ) : (
              canEditItems && items.length > 0 && (
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase">
                    Productos · {items.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditing((v) => !v)}
                    className={`min-h-[36px] h-9 px-3 rounded-xl text-[10px] font-semibold uppercase tracking-[0.15em] flex items-center gap-1.5 active:scale-95 transition-transform ${
                      editing
                        ? "bg-[#ef4444]/15 border border-[#ef4444]/40 text-[#ef4444]"
                        : "bg-white/5 border border-white/10 text-white/60"
                    }`}
                  >
                    {editing ? <Check size={12} /> : <Pencil size={12} />}
                    {editing ? "Listo" : "Editar"}
                  </button>
                </div>
              )
            )}

            {items.length === 0 ? (
              <div className="text-center py-12 text-white/40 text-[12px] font-bold uppercase tracking-widest">
                Sin items
              </div>
            ) : splitMode && splitMethod === "seat" ? (
              orderedSeatKeys.map((key) => {
                const bucket = seatBuckets.get(key) ?? [];
                const allIn = bucket.every((it) => selected.has(it.id));
                const label = key === "shared" ? "Compartido" : `Comensal ${key}`;
                return (
                  <div key={String(key)} className="space-y-2">
                    <button
                      type="button"
                      onClick={() => toggleSeat(key)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-colors ${
                        allIn
                          ? "bg-[var(--brand-soft)] border-[var(--brand)]"
                          : "bg-white/5 border-white/10"
                      }`}
                    >
                      {allIn ? (
                        <CheckCircle2 size={18} className="text-[var(--brand)]" strokeWidth={2.5} />
                      ) : (
                        <Circle size={18} className="text-white/30" />
                      )}
                      <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white flex-1">
                        {label}
                      </span>
                      <span className="text-[10px] font-bold text-white/40">
                        {bucket.length} item{bucket.length === 1 ? "" : "s"}
                      </span>
                    </button>
                    <div className="pl-2 space-y-2">
                      {bucket.map((it, idx) => renderItemRow(it, idx))}
                    </div>
                  </div>
                );
              })
            ) : (
              items.map((it, idx) => renderItemRow(it, idx))
            )}
          </div>

          {/* TOTALS */}
          <div className="p-4 border-t border-white/5 bg-white/[0.02] space-y-2">
            {showSubtotalLine && (
              <div className="flex justify-between items-baseline text-[12px] text-white/60 font-bold">
                <span>Subtotal</span>
                <span className="tabular-nums">${(subtotal ?? 0).toFixed(2)}</span>
              </div>
            )}
            {showDiscountLine && (
              <div className="flex justify-between items-baseline text-[12px] text-[#88D66C] font-bold">
                <span>Descuento</span>
                <span className="tabular-nums">- ${(discount ?? 0).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-1">
              <span className="text-[10px] font-semibold tracking-[0.25em] text-white/40 uppercase">
                Total
              </span>
              <span className="tabular-nums text-3xl font-black text-white">
                ${total.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* FOOTER: confirmación de split o acciones normales */}
        {splitMode ? (
          <div className="relative z-10 p-4 border-t border-white/5 bg-[var(--bg)] flex items-center gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40">
                Nuevo ticket · {selectedCount} item{selectedCount === 1 ? "" : "s"}
              </div>
              <div className="text-xl font-black tabular-nums text-white">
                ${selectedTotal.toFixed(2)}
              </div>
            </div>
            <button
              type="button"
              onClick={confirmSplit}
              disabled={splitInvalid || splitting}
              className="min-h-[52px] h-[52px] px-5 rounded-2xl bg-[var(--brand)] text-[var(--brand-fg)] text-[11px] font-black uppercase tracking-[0.12em] flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-30 disabled:active:scale-100"
            >
              <SplitSquareHorizontal size={17} strokeWidth={2.5} />
              {splitting ? "Dividiendo…" : "Dividir"}
            </button>
          </div>
        ) : (
          hasActions && (
            <div className="relative z-10 p-4 border-t border-white/5 bg-[var(--bg)] flex flex-col gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {/* AGREGAR PRODUCTOS — reabre la orden en el menú para sumar una ronda */}
              {onAddProducts && (
                <button
                  type="button"
                  onClick={onAddProducts}
                  className="w-full min-h-[52px] h-13 py-3 rounded-xl bg-[var(--brand-soft)] border border-[var(--brand)] text-[var(--brand)] font-semibold uppercase tracking-[0.1em] text-[11px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <ShoppingCart size={16} strokeWidth={2.5} />
                  Agregar productos
                </button>
              )}

              {/* DUAL REPRINT (Fase 4) */}
              {(onReprint || onReprintKitchen) && (
                <div className={`grid gap-2 ${onReprint && onReprintKitchen ? "grid-cols-2" : "grid-cols-1"}`}>
                  {onReprint && (
                    <button
                      type="button"
                      onClick={onReprint}
                      className="min-h-[48px] h-12 rounded-xl bg-white/5 border border-white/10 text-white font-semibold uppercase tracking-[0.1em] text-[10px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
                    >
                      <Printer size={16} />
                      Cuenta
                    </button>
                  )}
                  {onReprintKitchen && (
                    <button
                      type="button"
                      onClick={onReprintKitchen}
                      className="min-h-[48px] h-12 rounded-xl bg-white/5 border border-white/10 text-white font-semibold uppercase tracking-[0.1em] text-[10px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
                    >
                      <ChefHat size={16} />
                      Comanda
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {onChangeType && (
                  <button
                    type="button"
                    onClick={onChangeType}
                    className="min-h-[48px] h-12 rounded-xl bg-white/5 border border-white/10 text-white font-semibold uppercase tracking-[0.1em] text-[10px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  >
                    <Repeat size={16} />
                    Cambiar tipo
                  </button>
                )}

                {onMergeOrTransfer && (
                  <button
                    type="button"
                    onClick={onMergeOrTransfer}
                    className="min-h-[48px] h-12 rounded-xl bg-white/5 border border-white/10 text-white font-semibold uppercase tracking-[0.1em] text-[10px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  >
                    <ArrowRightLeft size={16} />
                    Mover mesa
                  </button>
                )}

                {onSplit && items.length >= 2 && (
                  <button
                    type="button"
                    onClick={enterSplit}
                    className="min-h-[48px] h-12 rounded-xl bg-white/5 border border-white/10 text-white font-semibold uppercase tracking-[0.1em] text-[10px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  >
                    <SplitSquareHorizontal size={16} />
                    Dividir
                  </button>
                )}

                {onAssignDriver && isDelivery && (
                  <button
                    type="button"
                    onClick={onAssignDriver}
                    className="min-h-[48px] h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 font-semibold uppercase tracking-[0.1em] text-[10px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  >
                    <Bike size={16} />
                    Asignar Rep.
                  </button>
                )}
              </div>

              {onCancelOrder && (
                <button
                  type="button"
                  onClick={onCancelOrder}
                  className="w-full min-h-[48px] h-12 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] font-semibold uppercase tracking-[0.1em] text-[10px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <Trash2 size={16} />
                  Eliminar ticket
                </button>
              )}

              {/* PRIMARY: COBRAR */}
              {onCharge && (
                <button
                  type="button"
                  onClick={onCharge}
                  className="w-full min-h-[56px] h-14 rounded-xl bg-[var(--brand)] text-[var(--brand-fg)] font-black uppercase tracking-[0.1em] text-[11px] flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-[0_10px_30px_var(--brand-glow)]"
                >
                  <Banknote size={16} strokeWidth={2.5} />
                  Cobrar ahora
                </button>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default OrderDetailModal;
