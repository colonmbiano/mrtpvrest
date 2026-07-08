"use client";

import { TONE_FG } from "@/components/ds";
import OrderCard from "./OrderCard";
import { STATUSES, type Driver, type Order } from "./orders";

/* Vista kanban: una columna por estado con scroll horizontal. */
export default function OrdersKanban({
  orders,
  drivers,
  onStatusChange,
  onAssignDriver,
  onUnassignDriver,
}: {
  orders: Order[];
  drivers: Driver[];
  onStatusChange: (id: string, status: string) => void;
  onAssignDriver: (orderId: string, driverId: string) => void;
  onUnassignDriver: (orderId: string) => void;
}) {
  return (
    <div className="ds-scrollbar flex gap-4 overflow-x-auto pb-4">
      {STATUSES.map((col) => {
        const colOrders = orders.filter((o) => o.status === col.key);
        const ColIcon = col.icon;
        return (
          <div key={col.key} className="flex w-[290px] shrink-0 flex-col gap-3">
            <div
              className="flex items-center justify-between rounded-ds-md px-3 py-2.5"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
            >
              <div className="flex items-center gap-2" style={{ color: TONE_FG[col.tone] }}>
                <ColIcon size={15} strokeWidth={2} />
                <span className="font-display text-xs font-extrabold uppercase tracking-wider">{col.label}</span>
              </div>
              <span
                className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-extrabold text-white"
                style={{ background: TONE_FG[col.tone] }}
              >
                {colOrders.length}
              </span>
            </div>
            {colOrders.length === 0 ? (
              <div
                className="rounded-ds-lg py-10 text-center text-xs text-tx-mut"
                style={{ border: "1px dashed var(--bd-1)" }}
              >
                Sin pedidos
              </div>
            ) : (
              colOrders.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  drivers={drivers}
                  onStatusChange={onStatusChange}
                  onAssignDriver={onAssignDriver}
                  onUnassignDriver={onUnassignDriver}
                />
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
