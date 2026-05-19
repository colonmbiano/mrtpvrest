"use client";
import React, { useEffect } from "react";
import { Delete, LogOut } from "lucide-react";
import { useClientValue } from "@/hooks/useClientValue";

interface LockScreenProps {
  restaurantName: string;
  locationName: string;
  pinInput: string;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSubmit: () => void;
  onUnlinkStart: () => void;
  onCancelUnlink?: () => void;
  isVerifying?: boolean;
  mode?: "login" | "unlink";
}

const LockScreen: React.FC<LockScreenProps> = ({
  pinInput,
  onDigit,
  onBackspace,
  onClear,
  onSubmit,
  onUnlinkStart,
  onCancelUnlink,
  isVerifying = false,
  mode = "login"
}) => {
  const pinLength = 4;
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const terminalId = useClientValue(
    () =>
      typeof window === "undefined"
        ? ""
        : localStorage.getItem("terminalId") ||
          localStorage.getItem("deviceName") ||
          localStorage.getItem("mb-device-role") ||
          "Caja Principal",
    "",
  );

  const terminalLabel = terminalId ? terminalId : "Caja Principal";

  // Auto-submit if the pin length is exactly 4
  useEffect(() => {
    if (pinInput.length === pinLength && !isVerifying) {
      onSubmit();
    }
  }, [pinInput, isVerifying, onSubmit]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center font-mono overflow-y-auto overflow-x-hidden px-4 py-[max(1rem,env(safe-area-inset-top))]" style={{ background: "#0C0C0E" }}>
      {/* Halo Glows */}
      <div 
        className="absolute pointer-events-none"
        style={{
          width: 800, height: 800, top: -200, left: -200,
          background: mode === "unlink" ? "radial-gradient(circle, #EF444420 0%, #EF444400 70%)" : "radial-gradient(circle, #FF840020 0%, #FF840000 70%)"
        }}
      />
      <div 
        className="absolute pointer-events-none"
        style={{
          width: 900, height: 900, bottom: -150, right: -150,
          background: "radial-gradient(circle, #88D66C15 0%, #88D66C00 70%)"
        }}
      />

      {/* Top Right Status Pill */}
      <div className="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-20 flex max-w-[calc(100vw-1.5rem-env(safe-area-inset-left)-env(safe-area-inset-right))] items-center gap-2 sm:gap-3 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-full border border-border" style={{ background: "var(--surface-2)" }}>
        <div className="w-2.5 h-2.5 rounded-full bg-success shadow-[0_0_8px_var(--success)]" />
        <span className="min-w-0 truncate text-[10px] sm:text-xs font-bold uppercase tracking-widest text-tx-mut">
          Terminal Vinculada: <span className="text-tx-pri">{terminalLabel}</span>
        </span>
      </div>

      {/* Top Left Unlink Button (only if not unlinking yet) */}
      {mode === "login" && (
        <button
          onClick={onUnlinkStart}
          className="fixed top-[max(0.75rem,env(safe-area-inset-top))] left-[max(0.75rem,env(safe-area-inset-left))] z-20 flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-full border border-border text-tx-mut hover:text-danger hover:bg-red-500/10 transition-colors"
          style={{ background: "var(--surface-2)" }}
        >
          <LogOut size={16} />
          <span className="hidden sm:inline text-xs font-bold uppercase tracking-widest">Desvincular</span>
        </button>
      )}

      <div className="relative z-10 my-16 flex flex-col items-center gap-5 sm:gap-8 w-full max-w-sm landscape:max-w-2xl landscape:grid landscape:grid-cols-[1fr_auto] landscape:items-center landscape:gap-8">
        <h1 className={`text-xl sm:text-3xl font-semibold tracking-tight text-center landscape:text-left ${mode === "unlink" ? "text-danger" : "text-tx-pri"}`}>
          {mode === "unlink" ? "PIN de Administrador" : "Ingresa tu PIN de Acceso"}
        </h1>
        {mode === "unlink" && (
          <p className="text-xs text-tx-mut font-bold uppercase tracking-widest text-center mt-[-20px]">
            Se requiere autorización para desvincular
          </p>
        )}

        {/* PIN Dots Indicator */}
        <div className="flex justify-center gap-4 py-4">
          {Array.from({ length: pinLength }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full transition-all duration-200 ${
                i < pinInput.length 
                  ? (mode === "unlink" ? "bg-danger shadow-[0_0_12px_var(--danger)] scale-110" : "bg-brand shadow-[0_0_12px_var(--brand)] scale-110") 
                  : "bg-surface-3"
              }`}
            />
          ))}
        </div>

        {/* KEYPAD */}
        <div className="grid grid-cols-3 gap-3 sm:gap-5 w-full max-w-[min(84vw,300px)] landscape:w-[min(42vw,300px)]">
          {digits.map((digit) => (
            <button
              key={digit}
              onClick={() => onDigit(digit.toString())}
              className="aspect-square w-full rounded-full flex items-center justify-center text-[clamp(1.5rem,6vmin,1.875rem)] font-medium text-tx-pri transition-all hover:bg-surf-3 active:scale-95"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
            >
              {digit}
            </button>
          ))}
          {/* Bottom row */}
          {mode === "unlink" ? (
             <button
              onClick={onCancelUnlink}
              className="aspect-square w-full rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-tx-mut transition-all hover:text-tx-pri hover:bg-surf-3 active:scale-95"
            >
              Cancelar
            </button>
          ) : (
             <button
              onClick={onClear}
              className="aspect-square w-full rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-tx-mut transition-all hover:text-tx-pri hover:bg-surf-3 active:scale-95"
            >
              Limpiar
            </button>
          )}
          <button
            onClick={() => onDigit("0")}
            className="aspect-square w-full rounded-full flex items-center justify-center text-[clamp(1.5rem,6vmin,1.875rem)] font-medium text-tx-pri transition-all hover:bg-surf-3 active:scale-95"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            0
          </button>
          <button
            onClick={onBackspace}
            className="aspect-square w-full rounded-full flex items-center justify-center text-tx-mut transition-all hover:text-tx-pri hover:bg-surf-3 active:scale-95"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            <Delete size={26} />
          </button>
        </div>

        {isVerifying && (
          <p className={`absolute -bottom-10 text-sm animate-pulse font-bold tracking-widest uppercase ${mode === "unlink" ? "text-danger" : "text-brand"}`}>
            Verificando...
          </p>
        )}
      </div>
    </div>
  );
};

export default LockScreen;
