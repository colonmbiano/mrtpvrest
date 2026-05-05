"use client";
import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import BaseModal from "@/components/ui/BaseModal";

export type OrderItemDetail = {
  id: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
};

export type OrderDetail = {
  id: string;
  number?: string;
  status: string;
  createdAt?: string;
  items: OrderItemDetail[];
  subtotal: number;
  discount?: number;
  total: number;
  customerName?: string;
  table?: string | null;
};

export default function OrderDetailModal({
  open,
  orderId,
  onClose,
  fetchOrder,
  onCancelOrder,
  onRemoveItem,
  onUpdateItem,
  currency = "$",
}: {
  open: boolean;
  orderId: string | null;
  onClose: () => void;
  fetchOrder?: (id: string) => Promise<OrderDetail>;
  onCancelOrder?: (id: string) => Promise<void> | void;
  onRemoveItem?: (orderId: string, itemId: string) => Promise<void> | void;
  onUpdateItem?: (orderId: string, itemId: string, patch: { quantity?: number; notes?: string }) => Promise<void> | void;
  currency?: string;
}) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !orderId) {
      setOrder(null);
      return;
    }
    if (!fetchOrder) return;
    let cancelled = false;
    setLoading(true);
    fetchOrder(orderId)
      .then((o) => { if (!cancelled) setOrder(o); })
      .catch((e) => toast.error(e?.message ?? "No se pudo cargar la orden"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, orderId, fetchOrder]);

  const fmt = (n: number) => `${currency}${n.toFixed(2)}`;

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      title={order ? `Orden ${order.number ?? order.id.slice(0, 6)}` : "Detalle de orden"}
      description={order ? `${order.status} · ${order.items.length} productos` : "Cargando..."}
      size="lg"
      footer={
        order && onCancelOrder ? (
          <button
            onClick={async () => {
              await onCancelOrder(order.id);
              toast.success("Orden cancelada");
              onClose();
            }}
            className="h-10 px-4 rounded-xl text-xs font-bold uppercase tracking-wider"
            style={{ background: "var(--danger-soft)", color: "var(--danger)", border: "1px solid var(--danger)" }}
          >
            <span className="inline-flex items-center gap-2">
              <AlertTriangle size={14} /> Cancelar orden
            </span>
          </button>
        ) : null
      }
    >
      {loading ? (
        <div className="h-40 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="animate-spin" />
        </div>
      ) : !order ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Sin datos de la orden.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div
            className="p-3 rounded-xl text-xs grid grid-cols-3 gap-3"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            <Field label="Cliente" value={order.customerName || "Mostrador"} />
            <Field label="Mesa"    value={order.table ?? "—"} />
            <Field label="Estado"  value={order.status} />
          </div>

          <ul className="flex flex-col gap-2">
            {order.items.map((it) => (
              <li
                key={it.id}
                className="p-3 rounded-xl flex items-center gap-3"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                    {it.quantity}× {it.name}
                  </p>
                  {it.notes && (
                    <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                      {it.notes}
                    </p>
                  )}
                </div>
                <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  {fmt(it.price * it.quantity)}
                </span>
                {onUpdateItem && (
                  <button
                    onClick={() => onUpdateItem(order.id, it.id, { quantity: it.quantity + 1 })}
                    className="px-2 py-1 rounded-md text-xs"
                    style={{ background: "var(--surface-3)", color: "var(--text-secondary)" }}
                  >
                    +1
                  </button>
                )}
                {onRemoveItem && (
                  <button
                    onClick={async () => {
                      await onRemoveItem(order.id, it.id);
                      toast.success("Producto eliminado");
                    }}
                    className="px-2 py-1 rounded-md text-xs"
                    style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
                  >
                    Quitar
                  </button>
                )}
              </li>
            ))}
          </ul>

          <div
            className="p-4 rounded-xl flex flex-col gap-2"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            <Row label="Subtotal" value={fmt(order.subtotal)} />
            {order.discount && order.discount > 0 && (
              <Row label="Descuento" value={`- ${fmt(order.discount)}`} tone="warn" />
            )}
            <Row label="Total" value={fmt(order.total)} bold />
          </div>
        </div>
      )}
    </BaseModal>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {value}
      </span>
    </div>
  );
}

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: "warn" }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ color: tone === "warn" ? "var(--warning)" : "var(--text-primary)", fontWeight: bold ? 800 : 600 }}>
        {value}
      </span>
    </div>
  );
}
