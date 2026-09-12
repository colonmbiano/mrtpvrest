"use client";

import { useState } from "react";
import { Delete, LockKeyhole, X } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { accessMessage, canPerform, type PosAction } from "../lib/access";

export default function EmployeePinModal({ onClose, onSuccess, action = "login" }: { onClose: () => void; onSuccess: () => void; action?: PosAction }) {
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const { loginWithPin, loading } = useAuthStore();
  const press = (value: string) => {
    setMessage("");
    if (value === "delete") return setPin((current) => current.slice(0, -1));
    if (pin.length < 6) setPin((current) => current + value);
  };
  const submit = async () => {
    if (pin.length < 4) return setMessage("Ingresa tu PIN de 4 a 6 dígitos.");
    const result = await loginWithPin(pin);
    if (!result.success) { setMessage(result.error || "PIN incorrecto"); setPin(""); return; }
    if (!canPerform(useAuthStore.getState().employee, action)) {
      setMessage(accessMessage(action)); setPin(""); return;
    }
    onSuccess();
  };
  return (
    <div className="tokki-overlay" role="dialog" aria-modal="true" aria-labelledby="pin-title">
      <div className="pin-card">
        <button onClick={onClose} disabled={loading} className="modal-close" aria-label="Cerrar"><X size={20} /></button>
        <LockKeyhole size={28} className="text-[var(--brand-strong)]" />
        <h2 id="pin-title" className="text-xl font-black">PIN del empleado</h2>
        <p className="text-xs font-bold text-[var(--text-secondary)]">{action === "login" ? "Identifícate para usar esta caja." : action === "send" ? "Identifícate para enviar el pedido." : accessMessage(action)}</p>
        <div className="pin-dots" aria-label={`${pin.length} dígitos capturados`}>
          {Array.from({ length: 6 }).map((_, index) => <span key={index} className={index < pin.length ? "filled" : ""} />)}
        </div>
        <div className="pin-grid">
          {["1","2","3","4","5","6","7","8","9","0"].map((key) => <button key={key} disabled={loading} onClick={() => press(key)}>{key}</button>)}
          <button onClick={() => press("delete")} disabled={loading} aria-label="Borrar dígito"><Delete size={20} /></button>
        </div>
        {message && <p className="text-center text-xs font-black text-[var(--danger-fg)]" role="alert">{message}</p>}
        <button onClick={submit} disabled={loading || pin.length < 4} className="tokki-primary w-full">{loading ? "Verificando…" : "Entrar"}</button>
      </div>
    </div>
  );
}
