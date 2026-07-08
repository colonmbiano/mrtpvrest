"use client";

import { useState } from "react";
import {
  Bike, ChevronDown, ChevronUp, Inbox, MapPin, MessageCircle,
  StickyNote, Store, X,
} from "lucide-react";
import { Card, Pill, Select, TONE_FG } from "@/components/ds";
import { formatMoney } from "@/lib/format";
import {
  NEXT_STATUS, SOURCE_LABELS, STATUS_META, timeAgo,
  type Driver, type Order,
} from "./orders";

/* Tarjeta de pedido con detalle expandible, asignación de repartidor
   y avance al siguiente estado. */
export default function OrderCard({
  order,
  drivers,
  onStatusChange,
  onAssignDriver,
  onUnassignDriver,
}: {
  order: Order;
  drivers: Driver[];
  onStatusChange: (id: string, status: string) => void;
  onAssignDriver: (orderId: string, driverId: string) => void;
  onUnassignDriver: (orderId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = STATUS_META[order.status];
  const nextStatus = NEXT_STATUS[order.status];
  const nextMeta = nextStatus ? STATUS_META[nextStatus] : undefined;
  const elapsed = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
  const urgent = elapsed > 30 && !["DELIVERED", "CANCELLED"].includes(order.status);
  const Icon = meta?.icon ?? Inbox;
  const paid = order.paymentStatus === "PAID" || order.cashCollected === true;

  return (
    <Card
      className="overflow-hidden"
      style={urgent ? { borderColor: "var(--err)", boxShadow: "0 0 0 1px var(--err-soft)" } : undefined}
    >
      <div style={{ height: 2, background: TONE_FG[meta?.tone ?? "neutral"] }} />

      <div className="flex items-start gap-3 px-4 pb-2 pt-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="font-display text-sm font-extrabold text-tx-hi">{order.orderNumber}</span>
            {urgent && <Pill tone="err" live>{elapsed}m</Pill>}
            <Pill tone={meta?.tone ?? "neutral"}>
              <Icon size={11} strokeWidth={2} /> {meta?.label ?? order.status}
            </Pill>
            <Pill tone={paid ? "ok" : "warn"}>{paid ? "Pagado" : "Por cobrar"}</Pill>
          </div>
          <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-tx-mut">
            <span>{order.customerName || order.user?.name || "Invitado"}</span>
            {order.customerPhone && <><span>·</span><span>{order.customerPhone}</span></>}
            <span>·</span><span>{timeAgo(order.createdAt)}</span>
            <span>·</span><span>{SOURCE_LABELS[order.source ?? ""] || order.source}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-base font-extrabold text-primary">{formatMoney(order.total ?? 0, false)}</div>
          <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-tx-mut">
            {order.orderType === "DELIVERY" ? <Bike size={11} /> : <Store size={11} />}
            {order.paymentMethod === "CASH_ON_DELIVERY" ? "Efectivo" : "MP"}
          </div>
        </div>
      </div>

      <div className="px-4 pb-2 text-[11px] text-tx-mut">
        {order.items?.slice(0, 3).map((i) => `${i.quantity}x ${i.name}`).join(" · ")}
        {(order.items?.length ?? 0) > 3 && ` +${(order.items?.length ?? 0) - 3} más`}
      </div>

      {expanded && (
        <div className="flex flex-col gap-2 px-4 pb-3 pt-3" style={{ borderTop: "1px solid var(--bd-1)" }}>
          {order.items?.map((item) => (
            <div key={item.id} className="flex justify-between text-xs">
              <span className="text-tx">{item.quantity}x {item.name}{item.notes ? ` (${item.notes})` : ""}</span>
              <span className="font-mono text-tx-mut">{formatMoney(item.price * item.quantity, false)}</span>
            </div>
          ))}
          {order.deliveryAddress && (
            <div
              className="mt-1 flex items-start gap-2 rounded-ds-md p-2 text-xs text-tx-mut"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
            >
              <MapPin size={13} className="mt-0.5 shrink-0" /> {order.deliveryAddress}
            </div>
          )}
          {order.notes && (
            <div
              className="flex items-start gap-2 rounded-ds-md p-2 text-xs"
              style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
            >
              <StickyNote size={13} className="mt-0.5 shrink-0" /> {order.notes}
            </div>
          )}
          {order.orderType === "DELIVERY" && ["READY", "ON_THE_WAY"].includes(order.status) && (
            <div className="mt-1">
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Repartidor</div>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <Select
                    value={order.deliveryDriverId || ""}
                    onChange={(e) => { if (e.target.value) onAssignDriver(order.id, e.target.value); }}
                  >
                    <option value="">— Seleccionar repartidor —</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>{d.name} {d.phone ? `(${d.phone})` : ""}</option>
                    ))}
                  </Select>
                </div>
                {order.deliveryDriverId && (
                  <button
                    type="button"
                    onClick={() => onUnassignDriver(order.id)}
                    aria-label="Desasignar repartidor"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-ds-md"
                    style={{ background: "var(--err-soft)", color: "var(--err)" }}
                  >
                    <X size={14} strokeWidth={2.4} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 px-3 pb-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? "Contraer" : "Expandir"}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-ds-md text-tx-mut"
          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
        >
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>

        {order.customerPhone && (
          <a
            href={`https://wa.me/52${order.customerPhone.replace(/\D/g, "")}`}
            target="_blank" rel="noopener noreferrer"
            aria-label="WhatsApp"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-ds-md"
            style={{ background: "var(--ok-soft)", color: "var(--ok)" }}
          >
            <MessageCircle size={16} />
          </a>
        )}

        {nextStatus && nextMeta && (
          <button
            type="button"
            onClick={() => onStatusChange(order.id, nextStatus)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-ds-md py-2 font-display text-xs font-extrabold text-white transition-transform active:scale-95"
            style={{ background: TONE_FG[nextMeta.tone] }}
          >
            <nextMeta.icon size={14} strokeWidth={2.2} /> {nextMeta.label}
          </button>
        )}

        {order.status === "PENDING" && (
          <button
            type="button"
            onClick={() => onStatusChange(order.id, "CANCELLED")}
            aria-label="Cancelar pedido"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-ds-md"
            style={{ background: "var(--err-soft)", color: "var(--err)" }}
          >
            <X size={15} strokeWidth={2.4} />
          </button>
        )}
      </div>
    </Card>
  );
}
