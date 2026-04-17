"use client";
import { useEffect, useState } from "react";
import { IconCard, IconCheck, IconClose } from "@/components/Icon";
import { fmt } from "@/lib/format";

export type ChargeResult =
  | { success: true; transactionId: string; authorizationCode: string }
  | { success: false; errorCode: string; message: string };

export function TerminalChargeModal({
  amount, terminalId, onCharge, onClose,
}: {
  amount: number;
  terminalId: string;
  onCharge: () => Promise<ChargeResult>;
  onClose: (result: ChargeResult | null) => void;
}) {
  const [phase, setPhase] = useState<"prompting" | "processing" | "success" | "error">("prompting");
  const [result, setResult] = useState<ChargeResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (phase !== "prompting") return;
    setPhase("processing");
    onCharge().then((r) => {
      if (cancelled) return;
      setResult(r);
      setPhase(r.success ? "success" : "error");
      if (r.success) {
        setTimeout(() => onClose(r), 800);
      }
    });
    return () => { cancelled = true; };
  }, [phase, onCharge, onClose]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 32 }}>
      <div style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", width: "100%", maxWidth: 560, padding: 40, textAlign: "center" }}>
        {phase === "processing" && (
          <>
            <div style={{ color: "var(--brand-primary)", display: "flex", justifyContent: "center" }}>
              <IconCard size={96} />
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, fontFamily: "var(--font-display)", marginTop: 20 }}>
              Acerca o inserta tu tarjeta en la terminal
            </div>
            <div style={{ fontSize: 18, color: "var(--muted)", marginTop: 12, fontFamily: "var(--font-mono)" }}>
              Terminal {terminalId}
            </div>
            <div style={{ fontSize: 48, fontWeight: 900, color: "var(--brand-primary)", fontFamily: "var(--font-mono)", marginTop: 24 }}>
              {fmt(amount)}
            </div>
            <div style={{ marginTop: 28, fontSize: 14, color: "var(--muted)" }}>
              Esperando respuesta…
            </div>
          </>
        )}

        {phase === "success" && result && result.success && (
          <>
            <div style={{ color: "#10b981", display: "flex", justifyContent: "center" }}>
              <IconCheck size={96} />
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "var(--font-display)", marginTop: 20 }}>
              ¡Pago aprobado!
            </div>
            <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 8, fontFamily: "var(--font-mono)" }}>
              Auth {result.authorizationCode}
            </div>
          </>
        )}

        {phase === "error" && result && !result.success && (
          <>
            <div style={{ color: "#ef4444", display: "flex", justifyContent: "center" }}>
              <IconClose size={96} />
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "var(--font-display)", marginTop: 20 }}>
              Pago rechazado
            </div>
            <div style={{ fontSize: 16, color: "var(--muted)", marginTop: 12 }}>
              {result.message}
            </div>
            <button
              onClick={() => onClose(result)}
              style={{ marginTop: 24, padding: "14px 32px", background: "var(--brand-primary)", color: "var(--bg)", border: "none", borderRadius: "var(--radius-md)", fontSize: 16, fontWeight: 800, cursor: "pointer" }}
            >
              Entendido
            </button>
          </>
        )}
      </div>
    </div>
  );
}
