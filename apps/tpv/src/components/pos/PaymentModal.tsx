"use client";
import { useState } from "react";
import { Banknote, CreditCard, ArrowLeftRight, X } from "lucide-react";
import api from "@/lib/api";
import { usePermissionGate } from "@/contexts/PermissionGateContext";
import { toast } from "sonner";
import type { TicketData } from "@/store/ticketStore";

type PaymentMethod = "CASH" | "CARD" | "TRANSFER";

const METHODS: { id: PaymentMethod; label: string; icon: typeof Banknote; requiresAmount: boolean }[] = [
  { id: "CASH",     label: "Efectivo",      icon: Banknote,        requiresAmount: true  },
  { id: "CARD",     label: "Tarjeta",       icon: CreditCard,      requiresAmount: false },
  { id: "TRANSFER", label: "Transferencia", icon: ArrowLeftRight,  requiresAmount: false },
];

type Props = {
  ticket: TicketData;
  subtotal: number;
  total: number;
  onPaid: () => void;
  onClose: () => void;
};

export default function PaymentModal({ ticket, subtotal, total, onPaid, onClose }: Props) {
  const { run: runWithPermission } = usePermissionGate();
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [received, setReceived] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const change =
    method === "CASH" && received !== ""
      ? Math.max(0, Number(received) - total)
      : 0;
  const insufficient = method === "CASH" && received !== "" && Number(received) < total;

  function appendDigit(d: string) {
    if (submitting) return;
    if (d === "." && received.includes(".")) return;
    setReceived((r) => (r + d).slice(0, 8));
  }
  function backspace() {
    if (submitting) return;
    setReceived((r) => r.slice(0, -1));
  }

  async function submit() {
    if (submitting) return;
    if (method === "CASH" && (received === "" || Number(received) < total)) {
      toast.error("Monto insuficiente");
      return;
    }
    setSubmitting(true);
    try {
      // 1. Crear la orden con datos de la draft
      const createPayload = {
        items: ticket.items.map((it) => ({
          menuItemId: it.menuItemId,
          quantity: it.quantity,
          notes: it.notes ?? "",
        })),
        orderType: ticket.type,
        tableId: ticket.tableId || null,
        customerName: ticket.name || "Publico General",
        customerPhone: ticket.phone || null,
        subtotal,
        discount: ticket.discount,
        total,
      };

      const created = await runWithPermission((token) =>
        api.post("/api/orders/tpv", createPayload, {
          headers: token ? { "X-Permission-Override": token } : undefined,
        }),
      );
      const orderId: string = created.data?.id;
      if (!orderId) throw new Error("La orden no devolvió id");

      // 2. Marcar como pagada
      await runWithPermission((token) =>
        api.put(`/api/orders/${orderId}/payment`, { paymentMethod: method }, {
          headers: token ? { "X-Permission-Override": token } : undefined,
        }),
      );

      toast.success(`Cobro registrado · ${METHODS.find((m) => m.id === method)?.label}`);
      onPaid();
    } catch (e: any) {
      toast.error("Error al cobrar: " + (e?.response?.data?.error || e?.message || "desconocido"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-surf-1 border border-bd rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[95vh]">
        <header className="flex items-center justify-between px-5 py-4 border-b border-bd">
          <div>
            <span className="eyebrow">PROCESAR COBRO</span>
            <h2 className="text-lg font-black mt-0.5">Total ${total.toFixed(2)}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-surf-2 border border-bd flex items-center justify-center text-tx-mut"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </header>

        <div className="p-5 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => {
              const Icon = m.icon;
              const active = method === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => { setMethod(m.id); setReceived(""); }}
                  className={`
                    flex flex-col items-center gap-1.5 py-4 rounded-xl border transition-pos active:scale-95
                    ${active ? "bg-iris-soft border-iris-500 text-iris-500" : "bg-surf-2 border-bd text-tx-sec"}
                  `}
                >
                  <Icon size={22} />
                  <span className="text-[11px] font-black uppercase tracking-wider">{m.label}</span>
                </button>
              );
            })}
          </div>

          {method === "CASH" && (
            <div className="space-y-3">
              <label className="block">
                <span className="eyebrow">EFECTIVO RECIBIDO</span>
                <div className="mt-1 px-4 py-3 rounded-xl bg-surf-2 border border-bd font-black text-3xl mono tnum tracking-tight text-right">
                  ${received || "0"}
                </div>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button
                    key={n}
                    onClick={() => appendDigit(String(n))}
                    className="py-4 rounded-xl text-2xl sm:text-3xl font-black mono bg-surf-2 border border-bd active:scale-95 transition-all"
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => appendDigit(".")}
                  className="py-4 rounded-xl text-2xl font-black mono bg-surf-2 border border-bd active:scale-95"
                >
                  .
                </button>
                <button
                  onClick={() => appendDigit("0")}
                  className="py-4 rounded-xl text-2xl sm:text-3xl font-black mono bg-surf-2 border border-bd active:scale-95"
                >
                  0
                </button>
                <button
                  onClick={backspace}
                  aria-label="Borrar"
                  className="py-4 rounded-xl flex items-center justify-center bg-surf-2 border border-bd text-tx-mut active:scale-95"
                >
                  ⌫
                </button>
              </div>
              <div className="flex gap-2">
                {[total, total + 50, total + 100, total + 200].map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setReceived(amount.toFixed(0))}
                    className="flex-1 py-2 rounded-lg text-xs font-bold bg-surf-2 border border-bd text-tx-sec active:scale-95"
                  >
                    ${amount.toFixed(0)}
                  </button>
                ))}
              </div>
              {received !== "" && (
                <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-surf-2 border border-bd">
                  <span className="eyebrow">{insufficient ? "FALTA" : "CAMBIO"}</span>
                  <span
                    className={`text-xl font-black mono tnum ${insufficient ? "text-danger" : "text-success"}`}
                  >
                    ${(insufficient ? total - Number(received) : change).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="flex gap-2 p-4 border-t border-bd bg-surf-0">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-sm font-bold bg-surf-2 border border-bd text-tx-sec"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting || (method === "CASH" && insufficient)}
            className="flex-[2] py-3 rounded-xl text-sm font-black bg-iris-500 text-white shadow-lg shadow-iris-glow disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
          >
            {submitting ? "Procesando…" : `Cobrar $${total.toFixed(2)}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
