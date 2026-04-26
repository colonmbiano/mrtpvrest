"use client";
import { useMemo, useState } from "react";
import { Banknote, CreditCard, Split, Check } from "lucide-react";
import { toast } from "sonner";
import BaseModal from "@/components/ui/BaseModal";
import type { PaymentOrder } from "@/contexts/ModalContext";

type Method = "cash" | "card" | "mixed";

const METHODS: { id: Method; label: string; Icon: typeof Banknote }[] = [
  { id: "cash",  label: "Efectivo", Icon: Banknote },
  { id: "card",  label: "Tarjeta",  Icon: CreditCard },
  { id: "mixed", label: "Mixto",    Icon: Split },
];

export default function PaymentModal({
  open,
  order,
  onClose,
  onPaid,
  currency = "$",
}: {
  open: boolean;
  order: PaymentOrder | null;
  onClose: () => void;
  onPaid?: (payload: { method: Method; cash: number; card: number; change: number }) => Promise<void> | void;
  currency?: string;
}) {
  const [method, setMethod] = useState<Method>("cash");
  const [cashStr, setCashStr] = useState("");
  const [cardStr, setCardStr] = useState("");
  const [busy, setBusy] = useState(false);

  if (!order) return null;
  const total = order.total;
  const cash = parseFloat(cashStr) || 0;
  const card = parseFloat(cardStr) || 0;

  const collected = method === "cash" ? cash : method === "card" ? total : cash + card;
  const change = method === "cash" ? Math.max(0, cash - total) : 0;
  const missing = Math.max(0, total - collected);
  const canPay = collected >= total - 0.001;

  const fmt = (n: number) => `${currency}${n.toFixed(2)}`;

  const submit = async () => {
    if (!canPay || busy) return;
    setBusy(true);
    try {
      await onPaid?.({
        method,
        cash: method === "card" ? 0 : Math.min(cash, total),
        card: method === "cash" ? 0 : method === "card" ? total : card,
        change,
      });
      toast.success(`Cobro registrado · ${fmt(total)}`);
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Error al registrar el cobro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title={`Cobrar ${fmt(total)}`}
      description={order.customerName ? `Cliente: ${order.customerName}` : "Venta de mostrador"}
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={busy}
            className="h-11 px-4 rounded-xl text-xs font-bold uppercase tracking-wider"
            style={{ background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border-strong)" }}
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!canPay || busy}
            className="h-11 px-6 rounded-xl text-xs font-bold uppercase tracking-wider transition-all hover:brightness-110 disabled:opacity-40"
            style={{ background: "var(--brand)", color: "var(--brand-fg)" }}
          >
            <span className="inline-flex items-center gap-2">
              <Check size={14} /> {busy ? "Procesando..." : "Confirmar cobro"}
            </span>
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-2">
          {METHODS.map(({ id, label, Icon }) => {
            const active = method === id;
            return (
              <button
                key={id}
                onClick={() => setMethod(id)}
                className="h-20 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all"
                style={{
                  background: active ? "var(--brand-soft)" : "var(--surface-2)",
                  border: active ? "1px solid var(--brand)" : "1px solid var(--border)",
                  color: active ? "var(--brand)" : "var(--text-secondary)",
                }}
              >
                <Icon size={20} />
                <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
              </button>
            );
          })}
        </div>

        {(method === "cash" || method === "mixed") && (
          <AmountInput
            label="Efectivo recibido"
            value={cashStr}
            onChange={setCashStr}
            quickValues={method === "cash" ? quickCashValues(total) : undefined}
            currency={currency}
          />
        )}

        {(method === "card" || method === "mixed") && (
          <AmountInput
            label={method === "card" ? "Importe en tarjeta" : "Tarjeta"}
            value={method === "card" ? total.toFixed(2) : cardStr}
            onChange={method === "card" ? () => {} : setCardStr}
            disabled={method === "card"}
            currency={currency}
          />
        )}

        <div
          className="p-4 rounded-xl flex flex-col gap-2"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          <Row label="Total a cobrar" value={fmt(total)} />
          <Row label="Recibido"       value={fmt(collected)} />
          {missing > 0 ? (
            <Row label="Falta" value={fmt(missing)} tone="danger" bold />
          ) : (
            <Row label="Cambio" value={fmt(change)} tone="brand" bold />
          )}
        </div>
      </div>
    </BaseModal>
  );
}

function quickCashValues(total: number) {
  const rounded = Math.ceil(total / 50) * 50;
  return Array.from(new Set([Math.ceil(total), rounded, rounded + 50, rounded + 100])).filter((v) => v >= total);
}

function AmountInput({
  label,
  value,
  onChange,
  quickValues,
  disabled,
  currency,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  quickValues?: number[];
  disabled?: boolean;
  currency: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        {label}
      </label>
      <div className="relative">
        <span
          className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold"
          style={{ color: "var(--text-muted)" }}
        >
          {currency}
        </span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="0.00"
          className="w-full h-12 pl-9 pr-4 rounded-xl text-lg font-bold outline-none disabled:opacity-60"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>
      {quickValues && quickValues.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {quickValues.map((q) => (
            <button
              key={q}
              onClick={() => onChange(q.toFixed(2))}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:brightness-110"
              style={{ background: "var(--surface-3)", color: "var(--text-primary)" }}
            >
              {currency}
              {q.toFixed(0)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  bold,
}: {
  label: string;
  value: string;
  tone?: "brand" | "danger";
  bold?: boolean;
}) {
  const color = tone === "danger" ? "var(--danger)" : tone === "brand" ? "var(--brand)" : "var(--text-primary)";
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ color, fontWeight: bold ? 800 : 600 }}>{value}</span>
    </div>
  );
}
