"use client";
import { useEffect, useState } from "react";
import { Armchair, ShoppingBag, Bike, MapPin, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import BaseModal from "@/components/ui/BaseModal";
import type { OrderType } from "@/components/tpv/TicketPanel";

export type ChangeOrderTypePayload = {
  orderId: string;
  currentType: OrderType;
  customerName?: string;
  total?: number;
  address?: string;
  tableName?: string | null;
};

const TYPES: { id: OrderType; label: string; sub: string; Icon: typeof Armchair }[] = [
  { id: "DINE_IN",  label: "Mesa",     sub: "Comer aquí",  Icon: Armchair },
  { id: "TAKEOUT",  label: "Llevar",   sub: "Para llevar", Icon: ShoppingBag },
  { id: "DELIVERY", label: "Domicilio", sub: "Envío",      Icon: Bike },
];

export default function ChangeOrderTypeModal({
  open,
  payload,
  onClose,
  onChange,
  onAssignDriverAfter,
  currency = "$",
}: {
  open: boolean;
  payload: ChangeOrderTypePayload | null;
  onClose: () => void;
  onChange?: (orderId: string, patch: { type: OrderType; address?: string; tableName?: string }) => Promise<void> | void;
  onAssignDriverAfter?: (orderId: string) => void;
  currency?: string;
}) {
  const [target, setTarget] = useState<OrderType>("TAKEOUT");
  const [address, setAddress] = useState("");
  const [assignNow, setAssignNow] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && payload) {
      setTarget(payload.currentType === "DINE_IN" ? "TAKEOUT" : payload.currentType);
      setAddress(payload.address ?? "");
      setAssignNow(true);
    }
  }, [open, payload]);

  if (!payload) return null;
  const isSame = target === payload.currentType;
  const needsAddress = target === "DELIVERY";
  const canConfirm = !isSame && (!needsAddress || address.trim().length > 0);

  const submit = async () => {
    if (!canConfirm || busy) return;
    setBusy(true);
    try {
      await onChange?.(payload.orderId, {
        type: target,
        address: target === "DELIVERY" ? address.trim() : undefined,
      });
      toast.success(`Tipo cambiado a ${TYPES.find((t) => t.id === target)?.label}`);
      const willChain = target === "DELIVERY" && assignNow && onAssignDriverAfter;
      onClose();
      if (willChain) onAssignDriverAfter(payload.orderId);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo cambiar el tipo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title="Cambiar tipo de orden"
      description={
        payload.customerName
          ? `${payload.customerName}${payload.total != null ? ` · ${currency}${payload.total.toFixed(2)}` : ""}`
          : "Reasigna esta orden"
      }
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={busy}
            className="h-10 px-4 rounded-xl text-xs font-bold uppercase tracking-wider"
            style={{ background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border-strong)" }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!canConfirm || busy}
            className="h-10 px-5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all hover:brightness-110 disabled:opacity-40"
            style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
          >
            <span className="inline-flex items-center gap-2">
              {busy ? "Cambiando..." : "Confirmar"}
              {!busy && <ArrowRight size={14} />}
            </span>
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <Label>Tipo actual</Label>
          <div
            className="px-3 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-2"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          >
            {(() => {
              const cur = TYPES.find((t) => t.id === payload.currentType);
              const Icon = cur?.Icon ?? Armchair;
              return (
                <>
                  <Icon size={14} /> {cur?.label ?? payload.currentType}
                </>
              );
            })()}
          </div>
        </div>

        <div>
          <Label>Nuevo tipo</Label>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map(({ id, label, sub, Icon }) => {
              const active = target === id;
              const disabled = id === payload.currentType;
              return (
                <button
                  key={id}
                  onClick={() => !disabled && setTarget(id)}
                  disabled={disabled}
                  className="h-24 rounded-xl flex flex-col items-center justify-center gap-1 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    background: active ? "var(--brand-soft)" : "var(--surface-2)",
                    border: active ? "1px solid var(--brand)" : "1px solid var(--border)",
                    color: active ? "var(--brand)" : "var(--text-secondary)",
                  }}
                >
                  <Icon size={22} />
                  <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {sub}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {needsAddress && (
          <div>
            <Label>Dirección de entrega</Label>
            <div className="relative">
              <MapPin
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Calle, número, colonia..."
                className="w-full h-11 pl-9 pr-3 rounded-xl text-sm outline-none"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
                autoFocus
              />
            </div>
            {onAssignDriverAfter && (
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={assignNow}
                  onChange={(e) => setAssignNow(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                  Asignar repartidor enseguida
                </span>
              </label>
            )}
          </div>
        )}
      </div>
    </BaseModal>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="block text-[10px] font-bold uppercase tracking-widest mb-1.5"
      style={{ color: "var(--text-muted)", letterSpacing: "0.14em" }}
    >
      {children}
    </span>
  );
}
