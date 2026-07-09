"use client";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Button, Modal } from "@/components/ds";

type ScanState = {
  active: boolean; currentFile: string; current: number; total: number; error: string | null;
};

/* Overlay de progreso del escaneo de menú con IA. No se puede cerrar mientras
   está en curso; el estado de error muestra un botón "Cerrar". */
export function AiScanOverlay({ scan, onReset }: { scan: ScanState; onReset: () => void }) {
  return (
    <Modal open={scan.active} onClose={() => { if (scan.error) onReset(); }} size="sm">
      <style>{`
        @keyframes ai-scan-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(500%); }
        }
      `}</style>
      <div className="flex w-full flex-col items-center gap-5 py-2 text-center">
        {scan.error ? (
          <>
            <span className="grid h-14 w-14 place-items-center rounded-ds-lg" style={{ background: "var(--err-soft)", color: "var(--err)" }}>
              <AlertTriangle size={28} strokeWidth={2} />
            </span>
            <h2 className="font-display text-xl font-extrabold text-tx-hi">Error al escanear</h2>
            <p className="px-2 text-sm text-tx-mut">{scan.error}</p>
            <Button onClick={onReset}>Cerrar</Button>
          </>
        ) : (
          <>
            <span className="grid h-16 w-16 animate-bounce place-items-center rounded-ds-lg text-primary" style={{ background: "var(--accent-soft)" }}>
              <Sparkles size={32} strokeWidth={2} />
            </span>
            <div>
              <h2 className="font-display text-xl font-extrabold text-tx-hi">Analizando con IA…</h2>
              <p className="mt-1 text-sm text-tx-mut">No cierres esta ventana</p>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surf-2)" }}>
              <div className="h-full w-1/3 rounded-full"
                style={{ background: "var(--brand-primary)", animation: "ai-scan-bar 1.5s infinite ease-in-out" }} />
            </div>
            <p className="text-xs text-tx-mut">
              Procesando:{" "}
              <span className="font-bold text-tx">{scan.currentFile}</span>
              {scan.total > 0 && ` (${scan.current} de ${scan.total})`}
            </p>
            <div className="flex gap-2">
              {[0, 1, 2].map(i => (
                <span key={i} className="h-2.5 w-2.5 animate-bounce rounded-full"
                  style={{ background: "var(--brand-primary)", animationDelay: `${i * 0.18}s` }} />
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export type { ScanState };
