"use client";
import React from "react";
import { X, Receipt, Printer, Banknote, ChefHat } from "lucide-react";

export interface OrderDetailItem {
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
}) => {
  if (!isOpen) return null;

  const showSubtotalLine =
    typeof subtotal === "number" && Math.abs(subtotal - total) > 0.001;
  const showDiscountLine = typeof discount === "number" && discount > 0;

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
      <div className="relative w-full max-w-[520px] max-h-[88vh] flex flex-col bg-[#0C0C0E] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
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

        {/* META */}
        <div className="relative z-10 p-5 grid grid-cols-2 gap-3 border-b border-white/5 shrink-0">
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
            <div className="text-[9px] font-black tracking-[0.2em] text-white/40 uppercase mb-1">
              Cliente
            </div>
            <div className="text-[13px] font-bold text-white truncate">
              {customerName || "Público general"}
            </div>
          </div>
          <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
            <div className="text-[9px] font-black tracking-[0.2em] text-white/40 uppercase mb-1">
              {tableName ? "Mesa" : "Apertura"}
            </div>
            <div className="text-[13px] font-bold text-white truncate">
              {tableName || formatTime(createdAt)}
            </div>
          </div>
          {status && (
            <div className="col-span-2 p-3 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-[9px] font-black tracking-[0.2em] text-white/40 uppercase mb-1">
                Estado
              </div>
              <div className="text-[13px] font-bold text-[#88D66C]">{status}</div>
            </div>
          )}
        </div>

        {/* ITEMS */}
        <div className="relative z-10 flex-1 overflow-y-auto p-5 space-y-3 scrollbar-hide">
          {items.length === 0 ? (
            <div className="text-center py-12 text-white/40 text-[12px] font-bold uppercase tracking-widest">
              Sin items
            </div>
          ) : (
            items.map((it, idx) => (
              <div
                key={idx}
                className="flex justify-between items-baseline gap-4 p-3 rounded-2xl bg-white/[0.03] border border-white/5"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-white truncate">
                    <span className="text-[#ffb84d] mr-2">{it.quantity}×</span>
                    {it.name}
                  </div>
                  {it.notes && (
                    <div className="text-[11px] font-medium text-white/50 italic truncate mt-1">
                      ✎ {it.notes}
                    </div>
                  )}
                </div>
                <div className="tabular-nums text-[13px] font-black text-white shrink-0">
                  ${it.subtotal.toFixed(2)}
                </div>
              </div>
            ))
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
        {(onReprint || onReprintKitchen || onCharge) && (
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
