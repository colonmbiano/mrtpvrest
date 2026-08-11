"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Plus, Banknote, Bell, Split, Move, PlusCircle, Brush, ReceiptText } from "lucide-react";
import Button from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import api from "@/lib/api";
import { useActiveOrderStore } from "@/store/activeOrderStore";
import { useWaiterRealtime } from "@/hooks/useWaiterRealtime";

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  roundId?: string | null;
}

interface OrderRound {
  id: string;
  roundNumber: number;
  createdAt: string;
}

interface ActiveOrder {
  id: string;
  orderNumber: string;
  total: number;
  subtotal: number;
  discount: number;
  customerName: string | null;
  createdAt: string;
  items: OrderItem[];
  rounds?: OrderRound[];
}

interface Zone {
  id: string;
  name: string;
  icon: string | null;
}

interface TableData {
  id: string;
  name: string;
  status: "AVAILABLE" | "OCCUPIED" | "DIRTY";
  zone: Zone | null;
  activeOrder: ActiveOrder | null;
}

const STATUS_COPY: Record<TableData["status"], string> = {
  AVAILABLE: "Libre",
  OCCUPIED: "Ocupada",
  DIRTY: "Sucia",
};

const STATUS_TONE: Record<
  TableData["status"],
  { ring: string; soft: string; text: string; dot: string }
> = {
  AVAILABLE: { ring: "border-white/10",         soft: "bg-white/5",                text: "text-white/70",   dot: "bg-zinc-500" },
  OCCUPIED:  { ring: "border-[var(--brand)]",     soft: "bg-[var(--brand-soft)]",           text: "text-[var(--brand)]",  dot: "bg-[var(--brand)]" },
  DIRTY:     { ring: "border-red-500/40",       soft: "bg-red-500/10",             text: "text-red-400",    dot: "bg-red-500" },
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" });
}

function elapsedMinutes(iso: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

export default function WaiterTableDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const setActiveOrder = useActiveOrderStore((s) => s.setActiveOrder);
  const clearActiveOrder = useActiveOrderStore((s) => s.clear);

  const [table, setTable] = useState<TableData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Estado de las acciones del mesero: pedir cuenta y marcar mesa limpia.
  const [billLoading, setBillLoading] = useState(false);
  const [billRequested, setBillRequested] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadTable = useCallback(async () => {
    try {
      const { data } = await api.get<TableData>(`/api/tables/${params.id}`);
      setTable(data);
      setErrorMsg(null);
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.error || "No se pudo cargar la mesa");
    } finally {
      setIsLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) loadTable(); });
    return () => { cancelled = true; };
  }, [loadTable]);

  // Tiempo real: una ronda nueva, un cobro o un cambio de estado de la
  // orden de ESTA mesa se reflejan sin salir de la pantalla.
  useWaiterRealtime({ onChange: () => loadTable() });

  // Tick cada 30s para refrescar "min en mesa" sin pegarle al backend.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const tone = useMemo(() => (table ? STATUS_TONE[table.status] : STATUS_TONE.AVAILABLE), [table]);
  const order = table?.activeOrder ?? null;

  // Items agrupados por ronda para mostrar la comanda como la vive la mesa:
  // "Ronda 1 · 20:45", "Ronda 2 · 21:14". Items sin roundId (órdenes previas
  // al sistema de rondas) caen en un grupo sin encabezado.
  const itemGroups = useMemo(() => {
    if (!order) return [];
    const rounds = order.rounds ?? [];
    const byRound = new Map<string | null, OrderItem[]>();
    for (const item of order.items) {
      const key = item.roundId ?? null;
      const arr = byRound.get(key) || [];
      arr.push(item);
      byRound.set(key, arr);
    }
    const groups: { label: string | null; items: OrderItem[] }[] = [];
    const legacy = byRound.get(null);
    if (legacy?.length) groups.push({ label: null, items: legacy });
    for (const round of rounds) {
      const items = byRound.get(round.id);
      if (items?.length) {
        groups.push({ label: `Ronda ${round.roundNumber} · ${formatTime(round.createdAt)}`, items });
      }
    }
    // Solo una ronda y nada legacy → sin encabezados (ruido innecesario).
    if (groups.length === 1) return [{ label: null, items: groups[0]!.items }];
    return groups;
  }, [order]);

  // 🧾 Pedir cuenta — imprime el ticket de cuenta en la impresora de caja.
  // El cobro lo hace caja en el TPV principal (D4): aquí solo se solicita.
  const handleRequestBill = async () => {
    if (!order || billLoading) return;
    setBillLoading(true);
    try {
      await api.post(`/api/orders/${order.id}/print-bill`);
      setBillRequested(true);
      toast.success("Cuenta enviada a caja");
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "No se pudo pedir la cuenta");
    } finally {
      setBillLoading(false);
    }
  };

  // 🧹 Mesa limpia — DIRTY → AVAILABLE. Visible solo cuando la mesa quedó
  // sucia tras el cobro.
  const handleClearTable = async () => {
    if (!table || clearing) return;
    setClearing(true);
    try {
      await api.post(`/api/tables/${table.id}/clear`);
      toast.success("Mesa disponible");
      await loadTable();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "No se pudo marcar la mesa");
    } finally {
      setClearing(false);
    }
  };

  // Navegación al catálogo. Si la mesa tiene orden activa, registramos el
  // orderId en el store para que /orden agregue una RONDA en lugar de crear
  // una orden nueva (POST /:id/items vs POST /tpv).
  const handleAddProducts = () => {
    if (!table) return;
    if (order) {
      setActiveOrder(order.id, table.id, order.orderNumber);
    } else {
      clearActiveOrder();
    }
    router.push(`/meseros/${table.id}/orden`);
  };

  return (
    <div
      className="h-full flex flex-col bg-[var(--bg)] text-white"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* HEADER */}
      <div className="p-4 border-b border-white/5 bg-white/5 backdrop-blur-md flex items-center gap-4 shrink-0">
        <button
          onClick={() => router.back()}
          className="w-12 h-12 min-h-[48px] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 active:scale-95 transition-transform shrink-0"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] font-semibold tracking-[0.14em] text-white/40 uppercase">
            {table?.zone
              ? `${table.zone.icon ? table.zone.icon + " " : ""}${table.zone.name}`
              : "Detalle de mesa"}
          </span>
          <h2 className="text-[18px] font-black leading-none truncate">
            {isLoading ? "Cargando…" : table ? table.name : "Mesa no encontrada"}
          </h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6 pb-40 scrollbar-hide">
        {isLoading ? (
          <>
            <div className="h-32 rounded-3xl bg-white/5 animate-pulse" />
            <div className="h-48 rounded-3xl bg-white/5 animate-pulse" />
          </>
        ) : errorMsg ? (
          <div className="p-6 rounded-3xl bg-red-500/10 border border-red-500/40 text-red-400 text-[13px] font-bold">
            {errorMsg}
          </div>
        ) : table ? (
          <>
            {/* HERO CARD */}
            <div
              className={`p-5 sm:p-6 rounded-3xl border-2 flex items-center gap-4 sm:gap-6 ${tone.ring} ${tone.soft}`}
            >
              <div
                className={`w-16 h-16 sm:w-20 sm:h-20 bg-white/5 rounded-3xl border-2 ${tone.ring} flex items-center justify-center font-black text-xl sm:text-2xl shadow-xl shrink-0 ${tone.text}`}
              >
                {table.name.replace(/^Mesa\s+/i, "").slice(0, 3).toUpperCase()}
              </div>
              <div className="flex-1 space-y-1 min-w-0">
                <div className={`font-semibold uppercase tracking-widest text-xs ${tone.text}`}>
                  {STATUS_COPY[table.status]}
                </div>
                {order ? (
                  <>
                    <div className="text-[13px] font-bold text-white/70 truncate">
                      {order.customerName || "Sin nombre"} · desde {formatTime(order.createdAt)}
                    </div>
                    <div className={`tabular-nums text-[12px] font-semibold ${tone.text}`}>
                      {elapsedMinutes(order.createdAt, now)} min en mesa · #{order.orderNumber}
                    </div>
                  </>
                ) : (
                  <div className="text-[13px] font-bold text-white/70">
                    Sin cuenta abierta
                  </div>
                )}
              </div>
            </div>

            {/* ACCOUNT SUMMARY */}
            {order && (
              <div className="p-5 sm:p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md space-y-5">
                <div className="flex justify-between items-end gap-3">
                  <span className="text-[10px] font-semibold tracking-[0.14em] text-white/40 uppercase">
                    Cuenta acumulada
                  </span>
                  <div className="tabular-nums text-2xl sm:text-3xl font-black">
                    ${order.total.toFixed(0)}
                  </div>
                </div>

                {order.items.length === 0 ? (
                  <p className="text-[12px] text-white/40 font-bold uppercase tracking-widest text-center py-4">
                    Sin items en la comanda
                  </p>
                ) : (
                  <div className="space-y-4">
                    {itemGroups.map((group, gi) => (
                      <div key={group.label ?? `g-${gi}`} className="space-y-3">
                        {group.label && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold tracking-[0.14em] text-[var(--brand)] uppercase shrink-0">
                              {group.label}
                            </span>
                            <span className="h-px flex-1 bg-white/10" />
                          </div>
                        )}
                        {group.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex justify-between items-baseline gap-4 text-[13px] font-bold"
                          >
                            <span className="text-white/80 truncate flex-1 min-w-0">
                              <span className="text-[var(--brand)] mr-2">{item.quantity}×</span>
                              {item.name}
                            </span>
                            <span className="tabular-nums text-white shrink-0">
                              ${item.subtotal.toFixed(0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ACTIONS GRID */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="soft"
                onClick={handleRequestBill}
                className={`flex-col min-h-[64px] h-20 gap-2 rounded-2xl group ${
                  billRequested
                    ? "bg-[var(--success-soft)] border-[var(--success)] text-[var(--success)]"
                    : "bg-white/5 border-white/10 text-white"
                }`}
                disabled={!order || billLoading}
              >
                {billRequested ? (
                  <ReceiptText size={20} />
                ) : (
                  <Banknote size={20} className="group-active:scale-110 transition-transform" />
                )}
                <span className="text-[11px] font-semibold uppercase tracking-tighter">
                  {billLoading ? "Enviando…" : billRequested ? "Cuenta solicitada" : "Pedir cuenta"}
                </span>
              </Button>
              <Button
                variant="soft"
                className="flex-col min-h-[64px] h-20 gap-2 rounded-2xl group bg-white/5 border-white/10 text-white"
              >
                <Bell size={20} className="group-active:scale-110 transition-transform" />
                <span className="text-[11px] font-semibold uppercase tracking-tighter">
                  Llamar TPV
                </span>
              </Button>
              <Button
                variant="soft"
                className="flex-col min-h-[64px] h-20 gap-2 rounded-2xl group bg-white/5 border-white/10 text-white"
                disabled={!order}
              >
                <Split size={20} className="group-active:scale-110 transition-transform" />
                <span className="text-[11px] font-semibold uppercase tracking-tighter">
                  Dividir cuenta
                </span>
              </Button>
              <Button
                variant="soft"
                className="flex-col min-h-[64px] h-20 gap-2 rounded-2xl group bg-white/5 border-white/10 text-white"
                disabled={!order}
              >
                <Move size={20} className="group-active:scale-110 transition-transform" />
                <span className="text-[11px] font-semibold uppercase tracking-tighter">
                  Cambiar mesa
                </span>
              </Button>
            </div>
          </>
        ) : null}
      </div>

      {/* STICKY BOTTOM CTA */}
      {!isLoading && table && (
        <div className="absolute bottom-0 left-0 right-0 px-4 pt-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 sm:pb-[calc(1.5rem_+_env(safe-area-inset-bottom))] bg-[var(--bg)] border-t border-white/5 backdrop-blur-xl">
          {table.status === "DIRTY" ? (
            <button
              type="button"
              onClick={handleClearTable}
              disabled={clearing}
              className="w-full min-h-[64px] h-16 rounded-3xl bg-[var(--success)] text-[var(--brand-fg)] font-black uppercase tracking-[0.1em] text-sm gap-3 shadow-[0_10px_30px_var(--brand-glow)] active:scale-95 transition-transform flex items-center justify-center disabled:opacity-50"
            >
              <Brush size={20} strokeWidth={2.5} />
              {clearing ? "Marcando…" : "Marcar mesa limpia"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleAddProducts}
              className="w-full min-h-[64px] h-16 rounded-3xl bg-[var(--brand)] text-[var(--brand-fg)] font-black uppercase tracking-[0.1em] text-sm gap-3 shadow-[0_10px_30px_var(--brand-glow)] active:scale-95 transition-transform flex items-center justify-center"
            >
              {order ? (
                <>
                  <PlusCircle size={20} strokeWidth={2.5} />
                  Agregar más productos
                </>
              ) : (
                <>
                  <Plus size={20} strokeWidth={2.5} />
                  Abrir comanda
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
