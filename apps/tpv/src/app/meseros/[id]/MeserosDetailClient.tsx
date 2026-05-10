"use client";
import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Plus, Banknote, Bell, Split, Move, PlusCircle } from "lucide-react";
import Button from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useActiveOrderStore } from "@/store/activeOrderStore";

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
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
  OCCUPIED:  { ring: "border-[#ffb84d]/40",     soft: "bg-[#ffb84d]/10",           text: "text-[#ffb84d]",  dot: "bg-[#ffb84d]" },
  DIRTY:     { ring: "border-red-500/40",       soft: "bg-red-500/10",             text: "text-red-400",    dot: "bg-red-500" },
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await api.get<TableData>(`/api/tables/${params.id}`);
        if (mounted) setTable(data);
      } catch (e: any) {
        if (mounted) setErrorMsg(e?.response?.data?.error || "No se pudo cargar la mesa");
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [params.id]);

  // Tick cada 30s para refrescar "min en mesa" sin pegarle al backend.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const tone = useMemo(() => (table ? STATUS_TONE[table.status] : STATUS_TONE.AVAILABLE), [table]);
  const order = table?.activeOrder ?? null;

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
      className="h-full flex flex-col bg-[#0C0C0E] text-white"
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
          <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
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
                <div className={`font-black uppercase tracking-widest text-xs ${tone.text}`}>
                  {STATUS_COPY[table.status]}
                </div>
                {order ? (
                  <>
                    <div className="text-[13px] font-bold text-white/70 truncate">
                      {order.customerName || "Sin nombre"} · desde {formatTime(order.createdAt)}
                    </div>
                    <div className={`tabular-nums text-[12px] font-black ${tone.text}`}>
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
                  <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
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
                  <div className="space-y-3">
                    {order.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex justify-between items-baseline gap-4 text-[13px] font-bold"
                      >
                        <span className="text-white/80 truncate flex-1 min-w-0">
                          <span className="text-[#ffb84d] mr-2">{item.quantity}×</span>
                          {item.name}
                        </span>
                        <span className="tabular-nums text-white shrink-0">
                          ${item.subtotal.toFixed(0)}
                        </span>
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
                className="flex-col min-h-[64px] h-20 gap-2 rounded-2xl group bg-white/5 border-white/10 text-white"
                disabled={!order}
              >
                <Banknote size={20} className="group-active:scale-110 transition-transform" />
                <span className="text-[11px] font-black uppercase tracking-tighter">
                  Pedir cuenta
                </span>
              </Button>
              <Button
                variant="soft"
                className="flex-col min-h-[64px] h-20 gap-2 rounded-2xl group bg-white/5 border-white/10 text-white"
              >
                <Bell size={20} className="group-active:scale-110 transition-transform" />
                <span className="text-[11px] font-black uppercase tracking-tighter">
                  Llamar TPV
                </span>
              </Button>
              <Button
                variant="soft"
                className="flex-col min-h-[64px] h-20 gap-2 rounded-2xl group bg-white/5 border-white/10 text-white"
                disabled={!order}
              >
                <Split size={20} className="group-active:scale-110 transition-transform" />
                <span className="text-[11px] font-black uppercase tracking-tighter">
                  Dividir cuenta
                </span>
              </Button>
              <Button
                variant="soft"
                className="flex-col min-h-[64px] h-20 gap-2 rounded-2xl group bg-white/5 border-white/10 text-white"
                disabled={!order}
              >
                <Move size={20} className="group-active:scale-110 transition-transform" />
                <span className="text-[11px] font-black uppercase tracking-tighter">
                  Cambiar mesa
                </span>
              </Button>
            </div>
          </>
        ) : null}
      </div>

      {/* STICKY BOTTOM CTA */}
      {!isLoading && table && (
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-[#0C0C0E]/95 border-t border-white/5 backdrop-blur-xl">
          <button
            type="button"
            onClick={handleAddProducts}
            className="w-full min-h-[64px] h-16 rounded-3xl bg-[#ffb84d] text-[#0C0C0E] font-black uppercase tracking-[0.1em] text-sm gap-3 shadow-[0_10px_30px_rgba(255,184,77,0.3)] active:scale-95 transition-transform flex items-center justify-center"
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
        </div>
      )}
    </div>
  );
}
