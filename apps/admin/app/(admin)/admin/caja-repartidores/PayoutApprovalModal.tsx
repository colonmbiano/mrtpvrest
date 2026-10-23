"use client";
import { useState } from "react";
import {
  AlertCircle, CheckCircle2, ArrowUpRight,
} from "lucide-react";
import {
  Modal, Button, Textarea, useToast,
} from "@/components/ds";

interface Payout {
  id: string;
  driverId: string;
  driverName: string;
  amount: number;
  currency: string;
  status: "PENDING" | "PAID";
  requestedAt: string;
  clabe?: string;
  cashOnHand?: number;
}

interface PayoutApprovalModalProps {
  open: boolean;
  payout: Payout | null;
  onClose: () => void;
  onApprove: (payoutId: string, paymentReference: string) => Promise<void>;
  onReject: (payoutId: string, reason: string) => Promise<void>;
}

export function PayoutApprovalModal({
  open, payout, onClose, onApprove, onReject,
}: PayoutApprovalModalProps) {
  const toast = useToast();
  const [mode, setMode] = useState<"review" | "approve" | "reject">("review");
  const [paymentRef, setPaymentRef] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!payout) return null;

  const cashWarning = (payout.cashOnHand ?? 0) > 0;
  const clabeValid = payout.clabe && /^\d{18}$/.test(payout.clabe);

  async function handleApprove() {
    if (!paymentRef.trim()) {
      toast.error("Indica la referencia de pago");
      return;
    }
    setBusy(true);
    try {
      await onApprove(payout.id, paymentRef.trim());
      setMode("review");
      setPaymentRef("");
      onClose();
      toast.success("Retiro aprobado");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Error al aprobar");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      toast.error("Indica el motivo del rechazo");
      return;
    }
    setBusy(true);
    try {
      await onReject(payout.id, rejectReason.trim());
      setMode("review");
      setRejectReason("");
      onClose();
      toast.success("Retiro rechazado");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Error al rechazar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) {
          setMode("review");
          setPaymentRef("");
          setRejectReason("");
          onClose();
        }
      }}
      title="Aprobación de retiro bancario"
      subtitle={payout.driverName}
      size="sm"
      footer={
        mode === "review"
          ? (
            <>
              <Button variant="secondary" disabled={busy} onClick={onClose}>Cerrar</Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  tone="warn"
                  disabled={busy}
                  onClick={() => setMode("reject")}
                >
                  Rechazar
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => setMode("approve")}
                >
                  Aprobar
                </Button>
              </div>
            </>
          )
          : mode === "approve"
            ? (
              <>
                <Button variant="secondary" disabled={busy} onClick={() => setMode("review")}>Atrás</Button>
                <Button disabled={busy || !paymentRef.trim()} onClick={handleApprove}>
                  {busy ? "..." : "Confirmar aprobación"}
                </Button>
              </>
            )
            : (
              <>
                <Button variant="secondary" disabled={busy} onClick={() => setMode("review")}>Atrás</Button>
                <Button tone="warn" disabled={busy || !rejectReason.trim()} onClick={handleReject}>
                  {busy ? "..." : "Confirmar rechazo"}
                </Button>
              </>
            )
      }
    >
      <div className="space-y-4">
        {mode === "review" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-ds-md p-3" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                <div className="text-[11px] text-tx-mut">Monto</div>
                <div className="font-display text-xl font-extrabold" style={{ color: "var(--brand-primary)" }}>
                  ${payout.amount.toFixed(2)}
                </div>
              </div>
              <div className="rounded-ds-md p-3" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                <div className="text-[11px] text-tx-mut">Moneda</div>
                <div className="font-display text-xl font-extrabold">{payout.currency}</div>
              </div>
            </div>

            {payout.clabe && (
              <div className="rounded-ds-md p-3" style={{ background: "var(--surf-2)", border: `1px solid ${clabeValid ? "var(--bd-1)" : "var(--err)"}` }}>
                <div className="text-[11px] text-tx-mut">CLABE</div>
                <div className="font-mono font-bold">{payout.clabe}</div>
                {!clabeValid && <div className="mt-1 text-xs" style={{ color: "var(--err)" }}>CLABE inválido (debe ser 18 dígitos)</div>}
              </div>
            )}

            {cashWarning && (
              <div
                className="flex gap-2 rounded-ds-md border p-3"
                style={{ borderColor: "var(--warn)", background: "var(--warn-soft)" }}
              >
                <AlertCircle size={16} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 2 }} />
                <div className="text-sm" style={{ color: "var(--warn)" }}>
                  <span className="font-bold">Efectivo en mano pendiente:</span>
                  {" "}
                  ${(payout.cashOnHand || 0).toFixed(2)}
                  <div className="mt-1 text-xs opacity-80">El repartidor debe entrega y conciliar efectivo antes del retiro.</div>
                </div>
              </div>
            )}

            <div className="space-y-1 rounded-ds-md p-3" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
              <div className="text-[11px] text-tx-mut">Solicitado</div>
              <div className="text-sm">
                {new Date(payout.requestedAt).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}
              </div>
            </div>
          </>
        )}

        {mode === "approve" && (
          <>
            <div className="rounded-ds-md p-4" style={{ background: "var(--ok-soft)" }}>
              <div className="flex gap-2">
                <CheckCircle2 size={20} style={{ color: "var(--ok)", flexShrink: 0 }} />
                <div className="text-sm font-medium" style={{ color: "var(--ok)" }}>
                  Confirma que el retiro de ${payout.amount.toFixed(2)} fue transferido al banco
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-tx-mut mb-2">
                Referencia de pago (folio, transacción, etc.)
              </label>
              <input
                type="text"
                autoFocus
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="Ej: TRX20261022001"
                className="h-10 w-full rounded-ds-md px-3 outline-none"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
              />
            </div>
          </>
        )}

        {mode === "reject" && (
          <>
            <div className="rounded-ds-md p-4" style={{ background: "var(--err-soft)" }}>
              <div className="flex gap-2">
                <AlertCircle size={20} style={{ color: "var(--err)", flexShrink: 0 }} />
                <div className="text-sm font-medium" style={{ color: "var(--err)" }}>
                  El repartidor será notificado del rechazo
                </div>
              </div>
            </div>

            <Textarea
              autoFocus
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Motivo del rechazo (ej: Datos bancarios incorrectos, CLABE inválida, etc.)"
              rows={4}
            />
          </>
        )}
      </div>
    </Modal>
  );
}
