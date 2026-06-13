"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, RotateCw } from "lucide-react";
import api from "@/lib/api";
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
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [order, setOrder] = useState<AccountOrder | null>(null);
  const [error, setError] = useState("");

  const loadAccount = async () => {
    if (!activeTableId) {
      router.replace("/mesas");
      return;
    }
    setLoadState("loading");
    setError("");

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

  useEffect(() => {
    void loadAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTableId]);

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

  return (
    <section className="min-h-screen bg-[#0a0a0c] px-5 py-5 pb-40 text-neutral-200">
      <header className="mb-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/mesas")}
          className="flex min-h-[56px] min-w-[56px] items-center justify-center rounded-lg border border-neutral-800 bg-[#121214] text-[#ffb84d] active:scale-95 transition-all duration-150"
          aria-label="Volver a mesas"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase tracking-wide text-[#ffb84d]">Cuenta abierta</p>
          <h1 className="truncate text-2xl font-black text-neutral-200">
            {activeTableName || "Mesa"}
          </h1>
        </div>
        <button
          type="button"
          onClick={loadAccount}
          className="flex min-h-[56px] min-w-[56px] items-center justify-center rounded-lg border border-neutral-800 bg-[#121214] text-[#ffb84d] active:scale-95 transition-all duration-150"
          aria-label="Actualizar cuenta"
        >
          <RotateCw size={22} />
        </button>
      </header>

      {loadState === "loading" && (
        <p className="rounded-lg border border-neutral-800 bg-[#121214] p-6 text-center text-base font-black text-neutral-400">
          Cargando cuenta...
        </p>
      )}

      {loadState === "error" && (
        <div className="grid gap-3 rounded-lg border border-neutral-800 bg-[#121214] p-5">
          <p className="text-base font-black text-[#ffb84d]">{error}</p>
          <button
            type="button"
            onClick={loadAccount}
            className="flex min-h-[60px] items-center justify-center rounded-lg border border-[#ffb84d] bg-[#ffb84d] px-4 text-lg font-black text-[#0a0a0c] active:scale-95 transition-all duration-150"
          >
            Reintentar
          </button>
        </div>
      )}

      {loadState === "empty" && (
        <div className="grid gap-3 rounded-lg border border-neutral-800 bg-[#121214] p-6 text-center">
          <p className="text-xl font-black text-neutral-100">Esta mesa no tiene cuenta abierta</p>
          <p className="text-base font-bold text-neutral-400">
            Inicia una comanda para abrir la cuenta.
          </p>
          <button
            type="button"
            onClick={() => router.push("/menu")}
            className="mt-2 flex min-h-[64px] items-center justify-center gap-2 rounded-lg border border-[#ffb84d] bg-[#ffb84d] px-4 text-lg font-black text-[#0a0a0c] active:scale-95 transition-all duration-150"
          >
            <Plus size={24} /> Iniciar comanda
          </button>
        </div>
      )}

      {loadState === "ready" && order && (
        <div className="grid gap-4">
          <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-[#121214] px-4 py-3">
            <p className="text-xs font-black uppercase text-neutral-500">Ticket</p>
            <p className="text-sm font-black text-neutral-300">{order.orderNumber}</p>
          </div>

          {/* Resumen rapido para revisar que no falte nada en la mesa. */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-neutral-800 bg-[#121214] p-3">
              <p className="text-xs font-black uppercase text-neutral-500">Productos</p>
              <p className="text-2xl font-black text-neutral-100">{itemCount}</p>
            </div>
            <div className="rounded-lg border border-neutral-800 bg-[#121214] p-3">
              <p className="text-xs font-black uppercase text-neutral-500">Rondas</p>
              <p className="text-2xl font-black text-neutral-100">{roundCount}</p>
            </div>
          </div>

          {groupedList.map((group) => (
            <section key={group.label}>
              <h2 className="mb-2 text-sm font-black uppercase tracking-wide text-neutral-500">
                {group.label}
              </h2>
              <div className="grid gap-2">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-neutral-800 bg-[#121214] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-black text-neutral-100">
                          <span className="text-[#ffb84d]">{item.quantity}x</span> {item.name}
                        </p>
                        {item.modifiers.length > 0 && (
                          <p className="mt-1 text-sm font-bold text-neutral-400">
                            {item.modifiers.map((m) => m.name).join(", ")}
                          </p>
                        )}
                        {item.notes && (
                          <p className="mt-1 text-sm font-medium italic text-neutral-500">
                            {item.notes}
                          </p>
                        )}
                      </div>
                      <p className="shrink-0 text-base font-black text-neutral-200">
                        {money(item.subtotal)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <div className="grid gap-2 rounded-lg border border-[#ffb84d] bg-[#121214] px-4 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-black uppercase text-neutral-400">Subtotal</p>
              <p className="text-base font-black text-neutral-200">{money(order.subtotal)}</p>
            </div>
            {order.discount > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-sm font-black uppercase text-neutral-400">Descuento</p>
                <p className="text-base font-black text-[#88d66c]">-{money(order.discount)}</p>
              </div>
            )}
            <div className="mt-1 flex items-center justify-between border-t border-neutral-800 pt-3">
              <p className="text-lg font-black uppercase text-[#ffb84d]">Total</p>
              <p className="text-2xl font-black text-neutral-100">{money(order.total)}</p>
            </div>
          </div>
        </div>
      )}

      {(loadState === "ready" || loadState === "empty") && (
        <div className="fixed inset-x-0 bottom-24 z-10 px-5">
          <button
            type="button"
            onClick={() => router.push("/menu")}
            className="flex min-h-[68px] w-full items-center justify-center gap-2 rounded-lg border border-[#ffb84d] bg-[#ffb84d] text-xl font-black text-[#0a0a0c] active:scale-95 transition-all duration-150 shadow-lg"
          >
            <Plus size={26} /> Agregar mas
          </button>
        </div>
      )}
    </section>
  );
}
