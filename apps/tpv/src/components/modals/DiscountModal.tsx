"use client";
import { useState } from "react";
import { Percent, DollarSign, Lock } from "lucide-react";
import { toast } from "sonner";
import BaseModal from "@/components/ui/BaseModal";

type DiscountType = "percent" | "amount";

export default function DiscountModal({
  open,
  orderId,
  total,
  onClose,
  onApply,
  verifyPin,
  currency = "$",
}: {
  open: boolean;
  orderId: string | null;
  total: number;
  onClose: () => void;
  onApply?: (orderId: string, discount: { type: DiscountType; value: number; reason?: string }) => Promise<void> | void;
  verifyPin?: (pin: string) => Promise<boolean>;
  currency?: string;
}) {
  const [type, setType] = useState<DiscountType>("percent");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  if (!orderId) return null;

  const numericValue = parseFloat(value) || 0;
  const discountAmount = type === "percent"
    ? Math.min(total, total * (numericValue / 100))
    : Math.min(total, numericValue);
  const finalTotal = Math.max(0, total - discountAmount);

  const submit = async () => {
    if (!(numericValue > 0)) return toast.error("Valor inválido");
    if (verifyPin) {
      if (!pin) return toast.error("PIN de autorización requerido");
      const ok = await verifyPin(pin);
      if (!ok) return toast.error("PIN incorrecto");
    }
    setBusy(true);
    try {
      await onApply?.(orderId, { type, value: numericValue, reason });
      toast.success("Descuento aplicado");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo aplicar");
    } finally {
      setBusy(false);
    }
  };

  const fmt = (n: number) => `${currency}${n.toFixed(2)}`;

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title="Aplicar descuento"
      description={`Total actual: ${fmt(total)}`}
      size="sm"
      footer={
        <>
          <button onClick={onClose} disabled={busy} className="h-10 px-4 rounded-xl text-xs font-bold uppercase"
            style={{ background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border-strong)" }}>
            Cancelar
          </button>
          <button onClick={submit} disabled={busy}
            className="h-10 px-5 rounded-xl text-xs font-bold uppercase hover:brightness-110 disabled:opacity-40"
            style={{ background: "var(--brand)", color: "var(--brand-fg)" }}>
            {busy ? "Aplicando..." : "Aplicar"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <TypeButton active={type === "percent"} onClick={() => setType("percent")} Icon={Percent} label="Porcentaje" />
          <TypeButton active={type === "amount"}  onClick={() => setType("amount")}  Icon={DollarSign} label="Monto fijo" />
        </div>

        <Field label={type === "percent" ? "Porcentaje (%)" : `Monto (${currency})`}>
          <input value={value} onChange={(e) => setValue(e.target.value)} type="number" step="0.01"
            className={INPUT} style={INPUT_STYLE} placeholder="0" />
        </Field>

        <Field label="Motivo (opcional)">
          <input value={reason} onChange={(e) => setReason(e.target.value)}
            className={INPUT} style={INPUT_STYLE} placeholder="Cliente frecuente, queja, etc." />
        </Field>

        {verifyPin && (
          <Field label="PIN de autorización">
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
              <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                type="password" inputMode="numeric"
                className={`${INPUT} pl-9`} style={INPUT_STYLE} placeholder="••••" />
            </div>
          </Field>
        )}

        <div className="p-3 rounded-xl flex flex-col gap-1.5"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <Row label="Descuento" value={`- ${fmt(discountAmount)}`} tone="warn" />
          <Row label="Total final" value={fmt(finalTotal)} bold tone="brand" />
        </div>
      </div>
    </BaseModal>
  );
}

const INPUT = "w-full px-3 py-2.5 rounded-lg text-sm outline-none";
const INPUT_STYLE: React.CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
};

function TypeButton({
  active, onClick, Icon, label,
}: { active: boolean; onClick: () => void; Icon: typeof Percent; label: string }) {
  return (
    <button onClick={onClick}
      className="h-16 rounded-xl flex flex-col items-center justify-center gap-1 transition-all"
      style={{
        background: active ? "var(--brand-soft)" : "var(--surface-2)",
        border: active ? "1px solid var(--brand)" : "1px solid var(--border)",
        color: active ? "var(--brand)" : "var(--text-secondary)",
      }}>
      <Icon size={16} />
      <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: "brand" | "warn" }) {
  const color = tone === "brand" ? "var(--brand)" : tone === "warn" ? "var(--warning)" : "var(--text-primary)";
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ color, fontWeight: bold ? 800 : 600 }}>{value}</span>
    </div>
  );
}
