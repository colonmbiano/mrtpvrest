"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Plus, RotateCw } from "lucide-react";
import api from "@/lib/api";
import { pendingOrdersFor, useOfflineQueueStore } from "@/store/useOfflineQueueStore";
import { useWaiterOrderStore } from "@/store/useWaiterOrderStore";

interface AccountModifier {
  id: string;
  name: string;
  priceAdd?: number | null;
}

interface AccountItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
  notes?: string | null;
  roundId?: string | null;
  modifiers: AccountModifier[];
}

interface AccountRound {
  id: string;
  roundNumber: number;
}

interface AccountOrder {
  id: string;
  orderNumber: string;
  subtotal: number;
  discount: number;
  total: number;
  customerName?: string | null;
  ticketName?: string | null;
  items: AccountItem[];
  rounds?: AccountRound[];
}

type LoadState = "loading" | "ready" | "empty" | "error";

function money(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function errorTextOf(err: unknown, fallback: string) {
  if (
    typeof err === "object" &&
    err !== null &&
    "response" in err &&
    typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
  ) {
    return (err as { response: { data: { error: string } } }).response.data.error;
  }
  return fallback;
}

export default function CuentaPage() {
  const router = useRouter();
  const activeTableId = useWaiterOrderStore((state) => state.activeTableId);
  const activeTableName = useWaiterOrderStore((state) => state.activeTableName);
  const setActiveOrder = useWaiterOrderStore((state) => state.setActiveOrder);
  const queue = useOfflineQueueStore((state) => state.queue);
  const lastSync = useOfflineQueueStore((state) => state.lastSync);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [order, setOrder] = useState<AccountOrder | null>(null);
  const [error, setError] = useState("");

  // Fetch puro: NO hace setState síncrono antes del primer await, así el
  // effect de montaje no dispara react-hooks/set-state-in-effect. El flash de
  // "cargando" lo pone loadAccount (wrapper de eventos) o el estado inicial.
  const applyAccount = async () => {
    if (!activeTableId) {
      router.replace("/mesas");
      return;
    }

    try {
      // 1. Buscar la orden OPEN de esta mesa (devuelve [{ id, orderNumber, ... }]).
      const { data: openOrders } = await api.get<Array<{ id: string }>>(
        `/api/orders/table/${activeTableId}/open`,
      );
      const orderId = Array.isArray(openOrders) && openOrders.length > 0 ? openOrders[0]?.id : null;
      if (!orderId) {
        setActiveOrder(null);
        setLoadState("empty");
        return;
      }

      // 2. Traer el detalle completo (items, modificadores, rondas, total).
      const { data } = await api.get<AccountOrder>(`/api/orders/${orderId}`);
      setOrder(data);
      setActiveOrder({
        id: data.id,
        itemCount: data.items.reduce((sum, item) => sum + item.quantity, 0),
        total: data.total,
        items: data.items.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          total: item.subtotal,
        })),
      });
      setLoadState("ready");
    } catch (err: unknown) {
      const message = errorTextOf(err, "No se pudo cargar la cuenta. Revisa la conexion.");
      setError(
        message.toLowerCase().includes("token")
          ? "Sesion vencida. Vuelve a ingresar tu PIN."
          : message,
      );
      setLoadState("error");
    }
  };

  // Wrapper para eventos (reintentar / refrescar): muestra el flash de carga.
  const loadAccount = () => {
    setLoadState("loading");
    setError("");
    void applyAccount();
  };

  useEffect(() => {
    // applyAccount sólo hace setState tras el await del fetch (microtask), no
    // es un cascading render síncrono; el rule lo marca por análisis estático.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void applyAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTableId]);

  // Cuando la cola sincroniza, el servidor ya tiene las rondas que estaban
  // pendientes: re-leemos la cuenta para que el "Pendiente" se convierta en
  // items reales sin parpadeo.
  const lastSyncRef = useRef(lastSync);
  useEffect(() => {
    if (lastSync === lastSyncRef.current) return;
    lastSyncRef.current = lastSync;
    void applyAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSync]);

  // Comandas locales de esta mesa/cuenta que aún no llegan al servidor. Local-
  // first: se muestran como "Pendiente de sincronizar" para no perderlas de
  // vista entre que el mesero guarda y la cola las envía.
  const pendingTransactions = useMemo(
    () => pendingOrdersFor(queue, { tableId: activeTableId, orderId: order?.id ?? null }),
    [queue, activeTableId, order?.id],
  );
  const pendingItems = pendingTransactions.flatMap((transaction) => transaction.meta?.items ?? []);
  const pendingTotal = pendingTransactions.reduce(
    (sum, transaction) => sum + (transaction.meta?.total ?? 0),
    0,
  );
  const pendingItemCount = pendingItems.reduce((sum, item) => sum + item.quantity, 0);
  const pendingFailed = pendingTransactions.some((transaction) => transaction.failedPermanently);

  // Agrupar items por ronda para mostrar el orden cronologico de la comanda.
  const rounds = order?.rounds ?? [];
  const roundNumberById = new Map(rounds.map((r) => [r.id, r.roundNumber]));
  const grouped = new Map<string, { label: string; sort: number; items: AccountItem[] }>();
  for (const item of order?.items ?? []) {
    const rn = item.roundId ? roundNumberById.get(item.roundId) ?? 1 : 1;
    const key = String(rn);
    if (!grouped.has(key)) {
      grouped.set(key, { label: `Ronda ${rn}`, sort: rn, items: [] });
    }
    grouped.get(key)!.items.push(item);
  }
  const groupedList = Array.from(grouped.values()).sort((a, b) => a.sort - b.sort);

  // Resumen para revisar de un vistazo que no falte nada: cuantos productos
  // (sumando cantidades) y cuantas rondas lleva la cuenta.
  const itemCount = (order?.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
  const roundCount = groupedList.length;

  // Bloque "Pendiente de enviar": las comandas locales de esta mesa que la cola
  // aún no sincronizó. Se reusa en el estado vacío (mesa cuya cuenta todavía no
  // existe en el servidor) y debajo de la cuenta real.
  const pendingSection =
    pendingItems.length > 0 ? (
      <section
        className={[
          "grid gap-2 rounded-lg border bg-[var(--surface-1)] p-4",
          pendingFailed ? "border-[var(--danger)]" : "border-[var(--warning)]",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3">
          <p
            className={[
              "flex items-center gap-2 text-sm font-black uppercase",
              pendingFailed ? "text-[var(--danger)]" : "text-[var(--warning)]",
            ].join(" ")}
          >
            <Clock size={16} strokeWidth={2.8} />
            {pendingFailed ? "No se pudo enviar" : "Pendiente de enviar"}
          </p>
          <p className="text-sm font-black text-[var(--text-secondary)]">{money(pendingTotal)}</p>
        </div>
        {pendingItems.map((item, index) => (
          <div
            key={`${item.name}-${index}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-3)] p-3"
          >
            <p className="min-w-0 text-base font-black text-[var(--text-primary)]">
              <span className="text-[var(--brand)]">{item.quantity}x</span> {item.name}
            </p>
            <p className="shrink-0 text-base font-black text-[var(--text-primary)]">{money(item.total)}</p>
          </div>
        ))}
        <p className="text-xs font-bold text-[var(--text-muted)]">
          {pendingFailed
            ? "Revisa sesion, sucursal y turno en Perfil y reintenta."
            : "Se enviara al servidor en cuanto haya conexion."}
        </p>
      </section>
    ) : null;

  return (
    <section className="min-h-screen bg-[var(--bg)] px-5 py-5 pb-40 text-[var(--text-primary)]">
      <header className="mb-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/mesas")}
          className="flex min-h-[56px] min-w-[56px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--brand)] active:scale-95 transition-all duration-150"
          aria-label="Volver a mesas"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase tracking-wide text-[var(--brand)]">Cuenta abierta</p>
          <h1 className="truncate text-2xl font-black text-[var(--text-primary)]">
            {activeTableName || "Mesa"}
          </h1>
        </div>
        <button
          type="button"
          onClick={loadAccount}
          className="flex min-h-[56px] min-w-[56px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--brand)] active:scale-95 transition-all duration-150"
          aria-label="Actualizar cuenta"
        >
          <RotateCw size={22} />
        </button>
      </header>

      {loadState === "loading" && (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-6 text-center text-base font-black text-[var(--text-secondary)]">
          Cargando cuenta...
        </p>
      )}

      {loadState === "error" && (
        <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-5">
          <p className="text-base font-black text-[var(--brand)]">{error}</p>
          <button
            type="button"
            onClick={loadAccount}
            className="flex min-h-[60px] items-center justify-center rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-4 text-lg font-black text-[var(--brand-fg)] active:scale-95 transition-all duration-150"
          >
            Reintentar
          </button>
        </div>
      )}

      {loadState === "empty" && pendingItems.length === 0 && (
        <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-6 text-center">
          <p className="text-xl font-black text-[var(--text-primary)]">Esta mesa no tiene cuenta abierta</p>
          <p className="text-base font-bold text-[var(--text-secondary)]">
            Inicia una comanda para abrir la cuenta.
          </p>
          <button
            type="button"
            onClick={() => router.push("/menu")}
            className="mt-2 flex min-h-[64px] items-center justify-center gap-2 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-4 text-lg font-black text-[var(--brand-fg)] active:scale-95 transition-all duration-150"
          >
            <Plus size={24} /> Iniciar comanda
          </button>
        </div>
      )}

      {loadState === "empty" && pendingItems.length > 0 && (
        <div className="grid gap-4">
          <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-black text-[var(--text-secondary)]">
            Comanda guardada en esta tablet. Aun no aparece en el servidor.
          </p>
          {pendingSection}
        </div>
      )}

      {loadState === "ready" && order && (
        <div className="grid gap-4">
          <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
            <p className="text-xs font-black uppercase text-[var(--text-muted)]">Ticket</p>
            <p className="text-sm font-black text-[var(--text-secondary)]">{order.orderNumber}</p>
          </div>

          {/* Resumen rapido para revisar que no falte nada en la mesa. */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
              <p className="text-xs font-black uppercase text-[var(--text-muted)]">Productos</p>
              <p className="text-2xl font-black text-[var(--text-primary)]">{itemCount + pendingItemCount}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
              <p className="text-xs font-black uppercase text-[var(--text-muted)]">Rondas</p>
              <p className="text-2xl font-black text-[var(--text-primary)]">
                {roundCount + pendingTransactions.length}
              </p>
            </div>
          </div>

          {groupedList.map((group) => (
            <section key={group.label}>
              <h2 className="mb-2 text-sm font-black uppercase tracking-wide text-[var(--text-muted)]">
                {group.label}
              </h2>
              <div className="grid gap-2">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-black text-[var(--text-primary)]">
                          <span className="text-[var(--brand)]">{item.quantity}x</span> {item.name}
                        </p>
                        {item.modifiers.length > 0 && (
                          <p className="mt-1 text-sm font-bold text-[var(--text-secondary)]">
                            {item.modifiers.map((m) => m.name).join(", ")}
                          </p>
                        )}
                        {item.notes && (
                          <p className="mt-1 text-sm font-medium italic text-[var(--text-muted)]">
                            {item.notes}
                          </p>
                        )}
                      </div>
                      <p className="shrink-0 text-base font-black text-[var(--text-primary)]">
                        {money(item.subtotal)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {pendingSection}

          <div className="grid gap-2 rounded-lg border border-[var(--brand)] bg-[var(--surface-1)] px-4 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-black uppercase text-[var(--text-secondary)]">Subtotal</p>
              <p className="text-base font-black text-[var(--text-primary)]">{money(order.subtotal)}</p>
            </div>
            {order.discount > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-sm font-black uppercase text-[var(--text-secondary)]">Descuento</p>
                <p className="text-base font-black text-[var(--success)]">-{money(order.discount)}</p>
              </div>
            )}
            <div className="mt-1 flex items-center justify-between border-t border-[var(--border)] pt-3">
              <p className="text-lg font-black uppercase text-[var(--brand)]">Total</p>
              <p className="text-2xl font-black text-[var(--text-primary)]">{money(order.total)}</p>
            </div>
            {pendingTotal > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black uppercase text-[var(--warning)]">En cola</p>
                  <p className="text-base font-black text-[var(--warning)]">+{money(pendingTotal)}</p>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--border)] pt-2">
                  <p className="text-base font-black uppercase text-[var(--brand)]">Total con pendientes</p>
                  <p className="text-2xl font-black text-[var(--text-primary)]">
                    {money(order.total + pendingTotal)}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {(loadState === "ready" || loadState === "empty") && (
        <div className="fixed inset-x-0 bottom-24 z-10 px-5">
          <button
            type="button"
            onClick={() => router.push("/menu")}
            className="flex min-h-[68px] w-full items-center justify-center gap-2 rounded-lg border border-[var(--brand)] bg-[var(--brand)] text-xl font-black text-[var(--brand-fg)] active:scale-95 transition-all duration-150"
          >
            <Plus size={26} /> Agregar mas
          </button>
        </div>
      )}
    </section>
  );
}
