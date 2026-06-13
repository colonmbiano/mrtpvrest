"use client";

import { useState } from "react";
import { LockKeyhole, X } from "lucide-react";
import NumpadPIN from "./NumpadPIN";
import { unlockKiosk } from "@/lib/kioskMode";

interface Props {
  onClose: () => void;
}

export default function KioskUnlockModal({ onClose }: Props) {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(pin: string) {
    setSubmitting(true);
    setError("");
    try {
      await unlockKiosk(pin);
      onClose();
    } catch {
      setError("PIN incorrecto");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#0a0a0c]/90 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-3xl p-6 bg-[#17171b] border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.65)]">
        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2 text-[#ffb84d] mb-2">
              <LockKeyhole size={20} />
              <span className="text-[10px] font-black tracking-[0.25em] uppercase">Modo KDS</span>
            </div>
            <h3 className="text-xl font-black text-white tracking-tight">Desbloquear tablet</h3>
            <p className="text-sm font-medium text-white/55 mt-1">
              Introduce el PIN de administrador para abrir los ajustes del sistema.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        <NumpadPIN onSubmit={handleSubmit} disabled={submitting} />
        {error && <p className="mt-4 text-center text-xs font-black text-red-400">{error}</p>}
      </div>
    </div>
  );
}
