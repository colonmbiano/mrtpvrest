"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChefHat,
  ClipboardList,
  Plus,
  Printer,
  ReceiptText,
  RotateCw,
  WifiOff,
} from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import api from "@/lib/api";
import { TAKEOUT_MODE } from "@/lib/app-mode";
import { printCustomerReceipt, printKitchenTickets, type TicketItem } from "@/lib/printer";
import { useOfflineQueueStore } from "@/store/useOfflineQueueStore";
import { usePrinterStore } from "@/store/usePrinterStore";
import { useWaiterOrderStore } from "@/store/useWaiterOrderStore";

interface RecentTakeout {
  id: string;
  orderNumber: string;
  customerName?: string | null;
  ticketName?: string | null;
  total: number;
  status: string;
  paymentStatus: string;
  paymentMethod?: string | null;
  createdAt: string;
  _count?: { items?: number };
}

interface DetailPrinterGroupRef {
  printerGroup?: { id: string } | null;
}

interface TakeoutDetail {
  id: string;
  orderNumber: string;
  orderType?: string | null;
  customerName?: string | null;
  ticketName?: string | null;
  customerPhone?: string | null;
  subtotal: number;
  discount?: number | null;
  total: number;
  paymentMethod?: string | null;
  items: Array<{
    name: string;
    quantity: number;
    weightKg?: number | null;
    unit?: string | null;
    price: number;
    notes?: string | null;
    modifiers?: Array<{ name: string; priceAdd?: number | null }>;
    menuItem?: {
      printerGroups?: DetailPrinterGroupRef[];
      category?: { printerGroups?: DetailPrinterGroupRef[] } | null;
    } | null;
  }>;
}

function money(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function timeLabel(timestamp: number) {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  return minutes === 1 ? "hace 1 min" : `hace ${minutes} min`;
}

function orderTime(value: string) {
  return new Date(value).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function printerGroupIdsOf(item: TakeoutDetail["items"][number]) {
  const ids = (refs?: DetailPrinterGroupRef[]) =>
    (refs ?? []).map((ref) => ref.printerGroup?.id).filter((id): id is string => Boolean(id));
  const own = ids(item.menuItem?.printerGroups);
  return own.length > 0 ? own : ids(item.menuItem?.category?.printerGroups);
}

function printItemsOf(order: TakeoutDetail): TicketItem[] {
  return order.items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    weightKg: item.weightKg ?? null,
    unit: item.unit ?? null,
    price: Number(item.price || 0),
    notes: item.notes || undefined,
    modifiers: (item.modifiers ?? []).map((modifier) => ({
      name: modifier.name,
      priceAdd: Number(modifier.priceAdd || 0),
    })),
    printerGroupIds: printerGroupIdsOf(item),
  }));
}

function workspaceName() {
  if (typeof window === "undefined") return "Toki Boba";
  try {
    const raw = localStorage.getItem("meseros-lite-workspace");
    const workspace = raw ? (JSON.parse(raw) as { restaurantName?: string }) : null;
    return workspace?.restaurantName || "Toki Boba";
  } catch {
    return "Toki Boba";
  }
}

function TakeoutPedidosPage() {
  const router = useRouter();
  const queue = useOfflineQueueStore((state) => state.queue);
  const retryFailed = useOfflineQueueStore((state) => state.retryFailed);
  const lastSync = useOfflineQueueStore((state) => state.lastSync);
  const [orders, setOrders] = useState<RecentTakeout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [printingKey, setPrintingKey] = useState<string | null>(null);

  const pending = queue.filter((item) => !item.synced && item.meta?.tableId == null);
  const failed = pending.filter((item) => item.failedPermanently);

  const loadOrders = useCallback(async () => {
    try {
      const { data } = await api.get<RecentTakeout[]>("/api/orders/recent-takeout");
      setOrders(Array.isArray(data) ? data : []);
      setError("");
    } catch {
      setError("No se pudo actualizar el historial. Los pedidos en cola siguen guardados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // loadOrders solo actualiza estado después del await; el rule lo marca por
    // análisis estático aunque no hay render encadenado síncrono.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOrders();
  }, [loadOrders, lastSync]);

  const reprint = async (orderId: string, target: "kitchen" | "receipt") => {
    const key = `${orderId}:${target}`;
    setPrintingKey(key);
    setError("");
    setMessage("");
    try {
      const { data: order } = await api.get<TakeoutDetail>(`/api/orders/${orderId}`);
      const { printers, kitchenConfig } = usePrinterStore.getState();
      const customerName = order.ticketName || order.customerName || "Para llevar";
      const items = printItemsOf(order);
      const result = target === "kitchen"
        ? await printKitchenTickets(printers, {
            orderNumber: order.orderNumber,
            orderType: "TAKEOUT",
            customerName,
            items,
            config: kitchenConfig ?? undefined,
          })
        : await printCustomerReceipt(printers, {
            orderNumber: order.orderNumber,
            orderType: "TAKEOUT",
            customerName,
            customerPhone: order.customerPhone,
            items,
            subtotal: Number(order.subtotal || 0),
            discount: Number(order.discount || 0),
            total: Number(order.total || 0),
            paymentMethod: order.paymentMethod,
            businessName: workspaceName(),
          });

      if (result.ok === 0) {
        setError(
          result.failed[0]?.error ||
            (target === "kitchen"
              ? "No hay impresora de cocina activa para este pedido."
              : "No hay impresora de caja activa."),
        );
      } else {
        setMessage(target === "kitchen" ? "Comanda reimpresa." : "Cuenta impresa.");
      }
    } catch {
      setError("No se pudo cargar o imprimir el pedido.");
    } finally {
      setPrintingKey(null);
    }
  };

  return (
    <section className="min-h-screen bg-[var(--bg)] px-4 py-4 pb-28 text-[var(--text-primary)]">
      <header className="sticky top-0 z-20 -mx-4 mb-4 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg)] px-4 pb-3 pt-1 shadow-soft">
        <div>
          <p className="text-xs font-black text-[var(--brand)]">Toki Boba · Express</p>
          <h1 className="font-display text-[28px] font-black leading-tight">Pedidos</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void loadOrders();
          }}
          className="flex min-h-[52px] min-w-[52px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--brand)] active:scale-95"
          aria-label="Actualizar pedidos"
        >
          <RotateCw size={22} className={loading ? "animate-spin" : ""} />
        </button>
      </header>

      {(error || message) && (
        <p
          role="status"
          aria-live="polite"
          className={`mb-3 rounded-lg border bg-[var(--surface-1)] p-3 text-sm font-black ${
            error ? "border-[var(--danger)] text-[var(--danger)]" : "border-[var(--success)] text-[var(--success)]"
          }`}
        >
          {error || message}
        </p>
      )}

      <button
        type="button"
        onClick={() => router.push("/menu")}
        className="mb-4 flex min-h-[64px] w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-xl font-black text-[var(--brand-fg)] active:scale-[0.98]"
      >
        <Plus size={24} /> Nuevo pedido
      </button>

      {pending.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">
            Guardados en esta tablet
          </h2>
          <div className="grid gap-2">
            {pending.map((item, index) => (
              <article
                key={item.id}
                className={`rounded-lg border bg-[var(--surface-1)] p-4 ${
                  item.failedPermanently ? "border-[var(--danger)]" : "border-[var(--warning)]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black">Pedido local {index + 1}</p>
                    <p className="mt-1 text-sm font-bold text-[var(--text-secondary)]">
                      {item.meta?.itemCount || 0} unidades · {money(item.meta?.total || 0)} · {timeLabel(item.timestamp)}
                    </p>
                  </div>
                  <StatusBadge
                    status={item.failedPermanently ? "offline" : "open"}
                    label={item.failedPermanently ? "Error" : "Enviando"}
                  />
                </div>
              </article>
            ))}
          </div>
          {failed.length > 0 && (
            <button
              type="button"
              onClick={retryFailed}
              className="mt-2 min-h-[56px] w-full rounded-lg border border-[var(--danger)] bg-[var(--surface-1)] font-black text-[var(--danger)]"
            >
              Reintentar pedidos con error
            </button>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">
          Últimas 48 horas
        </h2>
        {loading && orders.length === 0 ? (
          <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-6 text-center font-bold text-[var(--text-secondary)]">
            Cargando pedidos...
          </p>
        ) : orders.length === 0 ? (
          <article className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-6 text-center">
            <ChefHat className="mx-auto text-[var(--brand)]" size={36} />
            <p className="mt-3 text-lg font-black">Todavía no hay pedidos</p>
            <p className="mt-1 text-sm font-bold text-[var(--text-secondary)]">
              Los pedidos enviados con este PIN aparecerán aquí.
            </p>
          </article>
        ) : (
          <div className="grid gap-3">
            {orders.map((order) => {
              const customerName = order.ticketName || order.customerName || "Para llevar";
              return (
                <article key={order.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-soft">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-[var(--brand)]">#{order.orderNumber} · {orderTime(order.createdAt)}</p>
                      <h3 className="mt-1 truncate text-xl font-black">{customerName}</h3>
                      <p className="mt-1 text-sm font-bold text-[var(--text-secondary)]">
                        {order._count?.items || 0} partidas · {order.paymentStatus === "PAID" ? "Pagado" : "Pendiente"}
                      </p>
                    </div>
                    <p className="shrink-0 text-2xl font-black text-[var(--brand)] tnum">{money(order.total)}</p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void reprint(order.id, "kitchen")}
                      disabled={printingKey !== null}
                      className="flex min-h-[56px] items-center justify-center gap-2 rounded-lg border border-[var(--brand)] bg-[var(--surface-3)] px-2 font-black text-[var(--brand)] disabled:text-[var(--text-muted)]"
                    >
                      <Printer size={20} /> {printingKey === `${order.id}:kitchen` ? "Imprimiendo" : "Cocina"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void reprint(order.id, "receipt")}
                      disabled={printingKey !== null}
                      className="flex min-h-[56px] items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-3)] px-2 font-black disabled:text-[var(--text-muted)]"
                    >
                      <ReceiptText size={20} /> {printingKey === `${order.id}:receipt` ? "Imprimiendo" : "Cuenta"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

function WaiterPedidosPage() {
  const router = useRouter();
  const assignedTables = useWaiterOrderStore((state) => state.assignedTables);
  const setActiveTable = useWaiterOrderStore((state) => state.setActiveTable);
  const ticketItems = useWaiterOrderStore((state) => state.ticketItems);
  const activeTableName = useWaiterOrderStore((state) => state.activeTableName);
  const previousItemCount = useWaiterOrderStore((state) => state.previousItemCount);
  const queue = useOfflineQueueStore((state) => state.queue);
  const retryFailed = useOfflineQueueStore((state) => state.retryFailed);

  const activeOrders = assignedTables
    .filter((table) => table.activeOrderId || table.status === "open")
    .sort((a, b) => (b.activeOrderTotal || 0) - (a.activeOrderTotal || 0));
  const queued = queue.filter((item) => !item.synced && !item.failedPermanently);
  const failed = queue.filter((item) => item.failedPermanently);
  const draftCount = ticketItems.reduce((sum, item) => sum + item.quantity, 0);
  const draftTotal = ticketItems.reduce((sum, item) => sum + item.total, 0);

  return (
    <section className="min-h-screen bg-[var(--bg)] px-4 py-5 pb-28 text-[var(--text-primary)]">
      <header className="mb-5">
        <p className="text-sm font-black uppercase tracking-wide text-[var(--text-secondary)]">
          Cocina y rondas
        </p>
        <h1 className="font-display text-[30px] font-black leading-tight">Pedidos</h1>
      </header>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <article className="rounded-card border border-[var(--border)] bg-[var(--surface-1)] p-3">
          <p className="text-xs font-black uppercase text-[var(--text-muted)]">Abiertas</p>
          <p className="mt-1 text-2xl font-black">{activeOrders.length}</p>
        </article>
        <article className="rounded-card border border-[var(--border)] bg-[var(--surface-1)] p-3">
          <p className="text-xs font-black uppercase text-[var(--text-muted)]">En cola</p>
          <p className="mt-1 text-2xl font-black text-[var(--warning)]">{queued.length}</p>
        </article>
        <article className="rounded-card border border-[var(--border)] bg-[var(--surface-1)] p-3">
          <p className="text-xs font-black uppercase text-[var(--text-muted)]">Fallidas</p>
          <p className="mt-1 text-2xl font-black text-[var(--danger)]">{failed.length}</p>
        </article>
      </div>

      {draftCount > 0 && (
        <article className="mb-4 rounded-card border border-[var(--warning)] bg-[var(--surface-2)] p-4 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <StatusBadge status="open" label="Pendiente" />
              <h2 className="mt-3 text-xl font-black">
                {activeTableName || "Para llevar"} · ronda en captura
              </h2>
              <p className="mt-1 text-sm font-bold text-[var(--text-secondary)]">
                {ticketItems.length} partidas · {draftCount} unidades nuevas · {previousItemCount} unidades enviadas
              </p>
            </div>
            <p className="shrink-0 text-2xl font-black tnum">{money(draftTotal)}</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/menu")}
            className="mt-4 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-soft border border-[var(--brand)] bg-[var(--brand)] px-4 text-lg font-black text-[var(--brand-fg)] active:scale-95 transition-all duration-150"
          >
            <ClipboardList size={22} /> Revisar comanda
          </button>
        </article>
      )}

      {queued.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">
            Sin WiFi · en cola local
          </h2>
          <div className="grid gap-2">
            {queued.slice(0, 6).map((item, index) => (
              <article
                key={item.id}
                className="rounded-card border border-[var(--warning)] bg-[var(--surface-1)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <StatusBadge status="offline" label={`Ronda ${index + 1}`} />
                    <p className="mt-2 text-base font-black">Pendiente por sincronizar</p>
                    <p className="mt-1 text-sm font-bold text-[var(--text-secondary)]">
                      {timeLabel(item.timestamp)}
                    </p>
                  </div>
                  <WifiOff className="text-[var(--warning)]" size={24} />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {failed.length > 0 && (
        <article className="mb-5 rounded-card border border-[var(--danger)] bg-[var(--surface-1)] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 shrink-0 text-[var(--danger)]" size={26} />
            <div className="min-w-0">
              <h2 className="text-lg font-black text-[var(--danger)]">Rondas con error</h2>
              <p className="mt-1 text-sm font-bold text-[var(--text-secondary)]">
                Revisa sesion, sucursal y turno. Luego intenta enviarlas otra vez.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={retryFailed}
            className="mt-4 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-soft border border-[var(--danger)] bg-[var(--surface-3)] text-base font-black text-[var(--danger)] active:scale-95 transition-all duration-150"
          >
            <RotateCw size={20} /> Reintentar fallidas
          </button>
        </article>
      )}

      <section>
        <h2 className="mb-2 text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">
          Cuentas abiertas
        </h2>
        <div className="grid gap-2">
          {activeOrders.length === 0 ? (
            <article className="rounded-card border border-[var(--border)] bg-[var(--surface-1)] p-5 text-center">
              <ChefHat className="mx-auto text-[var(--text-muted)]" size={34} />
              <p className="mt-3 text-lg font-black">Sin pedidos activos</p>
              <p className="mt-1 text-sm font-bold text-[var(--text-secondary)]">
                Abre una mesa o manda una ronda para verla aqui.
              </p>
            </article>
          ) : (
            activeOrders.map((table, index) => (
              <button
                key={table.id}
                type="button"
                onClick={() => {
                  setActiveTable(
                    table.id,
                    table.name,
                    table.activeOrderId
                      ? {
                          id: table.activeOrderId,
                          itemCount: table.activeOrderItemCount || 0,
                          total: table.activeOrderTotal || 0,
                        }
                      : null,
                  );
                  router.push("/cuenta");
                }}
                className="rounded-card border border-[var(--border)] bg-[var(--surface-1)] p-4 text-left active:scale-[0.99] transition-all duration-150"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <StatusBadge status={index === 0 ? "kitchen" : "open"} label={index === 0 ? "En cocina" : "Abierta"} />
                    <p className="mt-3 truncate text-xl font-black">{table.name}</p>
                    <p className="mt-1 text-sm font-bold text-[var(--text-secondary)]">
                      {table.zone || "Sin zona"} · {table.activeOrderItemCount || 0} partidas
                    </p>
                  </div>
                  <p className="shrink-0 text-xl font-black tnum">{money(table.activeOrderTotal || 0)}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </section>
    </section>
  );
}

export default function PedidosPage() {
  return TAKEOUT_MODE ? <TakeoutPedidosPage /> : <WaiterPedidosPage />;
}
