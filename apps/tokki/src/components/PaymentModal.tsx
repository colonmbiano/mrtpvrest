"use client";

import { useRef, useState } from "react";
import { Banknote, CreditCard, Heart, Loader2, Smartphone, X } from "lucide-react";

export type TokkiPaymentMethod = "CASH" | "CARD_PRESENT" | "TRANSFER";

export default function PaymentModal({ total, onClose, onSuccess, enabledMethods = ["CASH", "CARD_PRESENT", "TRANSFER"] }: {
  total: number;
  onClose: () => void;
  onSuccess: (method: TokkiPaymentMethod, received: number) => Promise<void>;
  enabledMethods?: TokkiPaymentMethod[];
}) {
  const [method, setMethod] = useState<TokkiPaymentMethod>(enabledMethods[0] || "CASH");
  const [received, setReceived] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const allMethods = [
    { id: "CASH" as const, label: "Efectivo", icon: Banknote, tone: "payment-lilac" },
    { id: "CARD_PRESENT" as const, label: "Tarjeta", icon: CreditCard, tone: "payment-cream" },
    { id: "TRANSFER" as const, label: "Transferencia", icon: Smartphone, tone: "payment-sage" },
  ];
  const methods = allMethods.filter((item) => enabledMethods.includes(item.id));
  const numReceived = method === "CASH" ? (Number.parseFloat(received) || 0) : total;
  const change = Math.max(0, numReceived - total);
  const press = (value: string) => {
    setError("");
    if (value === "C") return setReceived("0");
    if (value === "X") return setReceived((current) => current.length > 1 ? current.slice(0, -1) : "0");
    if (value === ".") return setReceived((current) => current.includes(".") ? current : `${current}.`);
    setReceived((current) => current === "0" ? value : `${current}${value}`);
  };
  const confirm = async () => {
    if (submitting.current || !enabledMethods.includes(method) || !Number.isFinite(numReceived) || (method === "CASH" && numReceived < total)) return;
    submitting.current = true;
    setSaving(true); setError("");
    try { await onSuccess(method, numReceived); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar el cobro"); }
    finally { submitting.current = false; setSaving(false); }
  };
  return (
    <div className="tokki-overlay payment-overlay" role="dialog" aria-modal="true" aria-labelledby="payment-title">
      <div className="payment-sheet">
        <header className="payment-header">
          <h2 id="payment-title"><span>Método de pago</span><Heart size={20} fill="currentColor" /></h2>
          <button onClick={onClose} disabled={saving} className="modal-close" aria-label="Cerrar cobro"><X size={20} /></button>
        </header>
        <div className="payment-methods">
          {methods.map(({ id, label, icon: Icon, tone }) => (
            <button key={id} disabled={saving} onClick={() => setMethod(id)} aria-pressed={method === id} className={`${tone} ${method === id ? "selected" : ""}`}>
              <Icon size={26} /><span>{label}</span>
            </button>
          ))}
        </div>
        <div className="payment-workspace">
          <section className="payment-summary">
            <div><span>Total a pagar</span><strong>${total.toFixed(2)}</strong></div>
            <div className="received-row"><span>Pago recibido</span><b>${numReceived.toFixed(2)}</b></div>
            <div><span>Cambio</span><strong className="text-[var(--sage-strong)]">${change.toFixed(2)}</strong></div>
          </section>
          <div className={`payment-keypad ${method !== "CASH" ? "disabled" : ""}`} aria-disabled={method !== "CASH"}>
            {["7","8","9","X","4","5","6","C","1","2","3","0","00","."].map((key) => <button key={key} onClick={() => press(key)} disabled={saving || method !== "CASH"}>{key}</button>)}
          </div>
        </div>
        {error && <p className="payment-error" role="alert">{error}</p>}
        <footer className="payment-footer">
          <button onClick={onClose} disabled={saving} className="tokki-secondary">Cancelar</button>
          <button onClick={confirm} disabled={saving || (method === "CASH" && numReceived < total)} className="tokki-primary">
            {saving ? <><Loader2 size={18} className="animate-spin" /> Guardando…</> : "Confirmar pago"}
          </button>
        </footer>
      </div>
    </div>
  );
}
