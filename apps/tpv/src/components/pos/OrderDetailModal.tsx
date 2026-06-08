"use client";
import React, { useState } from "react";
import { X, Receipt, Printer, Banknote, ChefHat, Pencil, Plus, Minus, Trash2, Check, Bike, Repeat } from "lucide-react";

export interface OrderDetailItem {
  /** itemId del backend (OrderItem.id). Requerido para editar/eliminar. */
  id?: string;
  name: string;
  quantity: number;
  subtotal: number;
  notes?: string | null;
}

interface OrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderNumber: string;
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

const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  isOpen,
  onClose,
  orderNumber,
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
}) => {
  const [editing, setEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState<{ id: string; value: string } | null>(null);

  if (!isOpen) return null;
  const canEditItems = !!(onUpdateItem || onDeleteItem);
  const isDelivery = orderType?.toUpperCase() === "DELIVERY" || orderType?.toUpperCase() === "DOMICILIO";

  const showSubtotalLine =
    typeof subtotal === "number" && Math.abs(subtotal - total) > 0.001;
  const showDiscountLine = typeof discount === "number" && discount > 0;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* ... rest of the component up to actions ... */}
      {/* OVERLAY */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* MODAL */}
      <div className="relative w-full max-w-[520px] max-h-[92vh] flex flex-col bg-[#0C0C0E] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Ambient warm-tech glow */}
        <div
          aria-hidden
          className="absolute pointer-events-none -top-24 -right-24 w-72 h-72 rounded-full opacity-30 blur-[80px]"
          style={{
            background:
              "radial-gradient(circle, rgba(255,184,77,0.4) 0%, transparent 70%)",
          }}
        />

        {/* HEADER */}
        <div className="relative z-10 p-5 border-b border-white/5 bg-white/5 backdrop-blur-md flex items-center gap-4 shrink-0">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#ffb84d]/15 text-[#ffb84d] border border-[#ffb84d]/30 shrink-0">
            <Receipt size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
              Detalle ticket
            </span>
            <div className="flex items-baseline gap-2">
              <h3 className="text-[18px] font-black text-white truncate leading-none">
                #{orderNumber}
              </h3>
              {orderType && (
                <span className="text-[11px] font-bold text-[#ffb84d] uppercase tracking-wider">
                  · {orderType}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-12 h-12 min-h-[48px] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 active:scale-95 transition-transform"
          >
            <X size={18} />
          </button>
        </div>

        {/* META — compacta para dejar el máximo de alto a los productos */}
        <div className="relative z-10 px-5 py-3 grid grid-cols-2 gap-2 border-b border-white/5 shrink-0">
          <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 min-w-0">
            <div className="text-[9px] font-black tracking-[0.2em] text-white/40 uppercase mb-0.5">
              Cliente
            </div>
            <div className="text-[13px] font-bold text-white truncate">
              {customerName || "Público general"}
            </div>
          </div>
          <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 min-w-0">
            <div className="text-[9px] font-black tracking-[0.2em] text-white/40 uppercase mb-0.5">
              {tableName ? "Mesa" : "Apertura"}
            </div>
            <div className="text-[13px] font-bold text-white truncate">
              {tableName || formatTime(createdAt)}
            </div>
          </div>
          {status && (
            <div className="col-span-2 flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
              <span className="text-[9px] font-black tracking-[0.2em] text-white/40 uppercase">
                Estado
              </span>
              <span className="text-[13px] font-bold text-[#88D66C]">{status}</span>
            </div>
          )}
        </div>

        {/* ITEMS */}
        <div className="relative z-10 flex-1 min-h-[160px] overflow-y-auto p-5 space-y-3 scrollbar-hide">
          {canEditItems && items.length > 0 && (
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
                Productos · {items.length}
              </span>
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className={`min-h-[36px] h-9 px-3 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] flex items-center gap-1.5 active:scale-95 transition-transform ${
                  editing
                    ? "bg-[#ef4444]/15 border border-[#ef4444]/40 text-[#ef4444]"
                    : "bg-white/5 border border-white/10 text-white/60"
                }`}
              >
                {editing ? <Check size={12} /> : <Pencil size={12} />}
                {editing ? "Listo" : "Editar"}
              </button>
            </div>
          )}
          {items.length === 0 ? (
            <div className="text-center py-12 text-white/40 text-[12px] font-bold uppercase tracking-widest">
              Sin items
            </div>
          ) : (
            items.map((it, idx) => {
              const itemId = it.id ?? null;
              const updating = !!(itemId && updatingItemId === itemId);
              const editingThis = editing && itemId !== null;
              const noteEditing = noteDraft?.id === itemId;
              return (
                <div
                  key={itemId ?? idx}
                  className="flex flex-col gap-2 p-3 rounded-2xl bg-white/[0.03] border border-white/5"
                >
                  <div className="flex justify-between items-start gap-3">
                    {editingThis && onUpdateItem && itemId ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateItem(itemId, { quantity: Math.max(1, it.quantity - 1) })
                          }
                          disabled={updating || it.quantity <= 1}
                          aria-label="Restar cantidad"
                          className="w-9 h-9 min-h-[36px] rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 active:scale-95 transition-transform disabled:opacity-30"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="tabular-nums text-[14px] font-black text-[#ffb84d] w-7 text-center">
                          {updating ? "…" : it.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateItem(itemId, { quantity: it.quantity + 1 })
                          }
                          disabled={updating}
                          aria-label="Sumar cantidad"
                          className="w-9 h-9 min-h-[36px] rounded-xl bg-[#ffb84d]/15 border border-[#ffb84d]/40 text-[#ffb84d] flex items-center justify-center active:scale-95 transition-transform disabled:opacity-30"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[13px] font-bold text-[#ffb84d] tabular-nums shrink-0">
                        {it.quantity}×
                      </span>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-white truncate">
                        {it.name}
                      </div>
                      {!noteEditing && it.notes && (
                        <div className="text-[11px] font-medium text-white/50 italic truncate mt-1">
                          ✎ {it.notes}
                        </div>
                      )}
                    </div>

                    <div className="tabular-nums text-[13px] font-black text-white shrink-0">
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
                          onChange={(e) =>
                            setNoteDraft({ id: itemId, value: e.target.value.slice(0, 200) })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              onUpdateItem(itemId, { notes: noteDraft!.value });
                              setNoteDraft(null);
                            }
                            if (e.key === "Escape") setNoteDraft(null);
                          }}
                          placeholder="Nota para cocina..."
                          className="flex-1 min-w-0 h-9 min-h-[36px] bg-white/5 border border-[#ffb84d]/30 rounded-xl px-3 text-[12px] text-white placeholder:text-white/30 outline-none focus:border-[#ffb84d]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateItem(itemId, { notes: noteDraft!.value });
                            setNoteDraft(null);
                          }}
                          aria-label="Guardar nota"
                          className="w-9 h-9 min-h-[36px] rounded-xl bg-[#ffb84d] text-[#0C0C0E] flex items-center justify-center active:scale-90 transition-transform"
                        >
                          <Check size={14} strokeWidth={3} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setNoteDraft({ id: itemId, value: it.notes ?? "" })}
                        className="self-start text-[10px] font-black uppercase tracking-[0.15em] text-white/40 active:text-[#ffb84d] transition-colors"
                      >
                        {it.notes ? "✎ Editar nota" : "+ Agregar nota"}
                      </button>
                    )
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* TOTALS */}
        <div className="relative z-10 p-5 border-t border-white/5 bg-white/[0.02] space-y-2 shrink-0">
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
            <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
              Total
            </span>
            <span className="tabular-nums text-3xl font-black text-white">
              ${total.toFixed(2)}
            </span>
          </div>
        </div>

        {/* ACTIONS */}
        {(onReprint || onReprintKitchen || onCharge || onMergeOrTransfer || onChangeType || onCancelOrder || (onAssignDriver && isDelivery)) && (
          <div className="relative z-10 p-4 border-t border-white/5 bg-[#0C0C0E] flex flex-col gap-3 shrink-0">
            {/* DUAL REPRINT (Fase 4) */}
            {(onReprint || onReprintKitchen) && (
              <div
                className={`grid gap-3 ${
                  onReprint && onReprintKitchen ? "grid-cols-2" : "grid-cols-1"
                }`}
              >
                {onReprint && (
                  <button
                    type="button"
                    onClick={onReprint}
                    className="min-h-[64px] h-16 rounded-2xl bg-white/5 border border-white/10 text-white font-black uppercase tracking-[0.1em] text-[11px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  >
                    <Printer size={16} />
                    Cuenta
                  </button>
                )}
                {onReprintKitchen && (
                  <button
                    type="button"
                    onClick={onReprintKitchen}
                    className="min-h-[64px] h-16 rounded-2xl bg-white/5 border border-white/10 text-white font-black uppercase tracking-[0.1em] text-[11px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  >
                    <ChefHat size={16} />
                    Comanda
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {onChangeType && (
                <button
                  type="button"
                  onClick={onChangeType}
                  className="min-h-[56px] h-14 rounded-2xl bg-white/5 border border-white/10 text-white font-black uppercase tracking-[0.1em] text-[11px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <Repeat size={16} />
                  Cambiar tipo
                </button>
              )}

              {onMergeOrTransfer && (
                <button
                  type="button"
                  onClick={onMergeOrTransfer}
                  className="min-h-[56px] h-14 rounded-2xl bg-white/5 border border-white/10 text-white font-black uppercase tracking-[0.1em] text-[11px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  ⇄ Mover mesa
                </button>
              )}

              {onAssignDriver && isDelivery && (
                <button
                  type="button"
                  onClick={onAssignDriver}
                  className="min-h-[56px] h-14 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-400 font-black uppercase tracking-[0.1em] text-[11px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
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
                className="w-full min-h-[56px] h-14 rounded-2xl bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] font-black uppercase tracking-[0.1em] text-[11px] flex items-center justify-center gap-2 active:scale-95 transition-transform"
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
                className="w-full min-h-[64px] h-16 rounded-2xl bg-[#ffb84d] text-[#0C0C0E] font-black uppercase tracking-[0.1em] text-[12px] flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-[0_10px_30px_rgba(255,184,77,0.3)]"
              >
                <Banknote size={16} strokeWidth={2.5} />
                Cobrar ahora
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderDetailModal;
