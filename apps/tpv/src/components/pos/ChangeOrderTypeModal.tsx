"use client";
import React, { useState } from "react";
import { X, Armchair, ShoppingBag, Bike, MapPin, Check } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { ORDER_TYPE_SHORT } from "@/lib/orderTypes";

/**
 * ChangeOrderTypeModal — flujo vivo (local-state, igual que pos/OrderDetailModal
 * y pos/PaymentModal). Self-contained: hace el PATCH a /api/orders/:id/type vía
 * el axios `api` (que ya inyecta el token accessToken/tpv-employee-token).
 *
 * Permite reasignar una orden abierta entre MESA (DINE_IN), LLEVAR (TAKEOUT) y
 * DOMICILIO (DELIVERY). El backend sanea tableId/deliveryAddress según el tipo
 * destino y libera la mesa si se sale de un dine-in.
 */

export type OrderType = "DINE_IN" | "TAKEOUT" | "DELIVERY";

interface ChangeOrderTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  /** Tipo actual de la orden (valor crudo del backend). */
  currentType: OrderType | string | null;
  /** Dirección actual (si la orden ya era DELIVERY) para precargar el input. */
  currentAddress?: string | null;
  /** Se invoca tras un cambio exitoso para que el padre refresque + cierre. */
  onSuccess: () => void;
}

const TYPES: { id: OrderType; label: string; sub: string; Icon: typeof Armchair }[] = [
  { id: "DINE_IN", label: ORDER_TYPE_SHORT.DINE_IN, sub: "Comer aquí", Icon: Armchair },
  { id: "TAKEOUT", label: ORDER_TYPE_SHORT.TAKEOUT, sub: "Mostrador", Icon: ShoppingBag },
  { id: "DELIVERY", label: ORDER_TYPE_SHORT.DELIVERY, sub: "Envío", Icon: Bike },
];

const ChangeOrderTypeModal: React.FC<ChangeOrderTypeModalProps> = ({
  isOpen,
  onClose,
  orderId,
  currentType,
  currentAddress,
  onSuccess,
}) => {
  const normalizedCurrent = (currentType || "").toString().toUpperCase() as OrderType;
  const [target, setTarget] = useState<OrderType>(
    normalizedCurrent === "DINE_IN" ? "TAKEOUT" : (normalizedCurrent as OrderType) || "TAKEOUT"
  );
  const [address, setAddress] = useState(currentAddress ?? "");
  const [saving, setSaving] = useState(false);

  // Sincronización en fase de render (patrón del repo, ver CategoryModal):
  // al (re)abrir con otra orden reseteamos la selección sin set-state-in-effect.
  const [prevSync, setPrevSync] = useState({ isOpen, orderId });
  if (prevSync.isOpen !== isOpen || prevSync.orderId !== orderId) {
    setPrevSync({ isOpen, orderId });
    if (isOpen) {
      setTarget(normalizedCurrent === "DINE_IN" ? "TAKEOUT" : (normalizedCurrent as OrderType) || "TAKEOUT");
      setAddress(currentAddress ?? "");
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  const isSame = target === normalizedCurrent;
  const needsAddress = target === "DELIVERY";
  const canSave = !saving && !isSame && (!needsAddress || address.trim().length > 0);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await api.patch(`/api/orders/${orderId}/type`, {
        type: target,
        ...(target === "DELIVERY" ? { deliveryAddress: address.trim() } : {}),
      });
      toast.success(`Tipo cambiado a ${TYPES.find((t) => t.id === target)?.label}`);
      onSuccess();
    } catch (err: any) {
      toast.error(
        "No se pudo cambiar el tipo: " +
          (err?.response?.data?.error || err?.message || "error desconocido")
      );
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* OVERLAY */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
        onClick={saving ? undefined : onClose}
      />

      {/* MODAL */}
      <div className="relative w-full max-w-[480px] flex flex-col bg-[var(--bg)] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div
          aria-hidden
          className="absolute pointer-events-none -top-24 -right-24 w-72 h-72 rounded-full opacity-30 blur-[80px]"
          style={{ background: "radial-gradient(circle, var(--brand-glow) 0%, transparent 70%)" }}
        />

        {/* HEADER */}
        <div className="relative z-10 p-5 border-b border-white/5 bg-white/5 backdrop-blur-md flex items-center gap-4 shrink-0">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--brand-soft)] text-[var(--brand)] border border-[var(--brand)] shrink-0">
            <ShoppingBag size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-semibold tracking-[0.14em] text-white/40 uppercase">
              Reasignar orden
            </span>
            <h3 className="text-[18px] font-black text-white truncate leading-none mt-0.5">
              Cambiar tipo
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar"
            className="w-12 h-12 min-h-[48px] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 active:scale-95 transition-transform disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* OPCIONES */}
        <div className="relative z-10 p-5 flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            {TYPES.map(({ id, label, sub, Icon }) => {
              const active = target === id;
              const isCurrent = id === normalizedCurrent;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTarget(id)}
                  className={`relative min-h-[112px] rounded-2xl flex flex-col items-center justify-center gap-1.5 px-2 py-3 transition-all active:scale-95 ${
                    active
                      ? "bg-[var(--brand-soft)] border-2 border-[var(--brand)] text-[var(--brand)]"
                      : "bg-white/[0.03] border-2 border-white/10 text-white/60"
                  }`}
                >
                  {isCurrent && (
                    <span className="absolute top-2 right-2 text-[8px] font-semibold tracking-[0.15em] uppercase px-1.5 py-0.5 rounded-md bg-white/10 text-white/50">
                      Actual
                    </span>
                  )}
                  <Icon size={26} strokeWidth={2} />
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-center leading-tight">
                    {label}
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wide text-white/40">
                    {sub}
                  </span>
                </button>
              );
            })}
          </div>

          {needsAddress && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold tracking-[0.14em] text-white/40 uppercase">
                Dirección de entrega
              </span>
              <div className="relative">
                <MapPin
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
                />
                <input
                  autoFocus
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Calle, número, colonia..."
                  className="w-full h-12 pl-10 pr-4 rounded-2xl bg-white/5 border border-white/10 text-[14px] font-bold text-white placeholder:text-white/30 outline-none focus:border-[var(--brand)]"
                />
              </div>
            </div>
          )}
        </div>

        {/* ACCIONES */}
        <div className="relative z-10 p-4 border-t border-white/5 bg-[var(--bg)] flex flex-col gap-3 shrink-0">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="w-full min-h-[64px] h-16 rounded-2xl bg-[var(--brand)] text-[var(--brand-fg)] font-black uppercase tracking-[0.1em] text-[13px] flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-[0_10px_30px_var(--brand-glow)] disabled:opacity-40 disabled:grayscale disabled:shadow-none"
          >
            <Check size={18} strokeWidth={2.5} />
            {saving ? "Guardando..." : isSame ? "Selecciona otro tipo" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChangeOrderTypeModal;
