"use client";
import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Plus, Banknote, Bell, Split, Move } from "lucide-react";
import Button from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

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

const STATUS_TONE: Record<TableData["status"], { ring: string; soft: string; text: string }> = {
  AVAILABLE: { ring: "border-bd",        soft: "bg-surf-1",          text: "text-tx-sec" },
  OCCUPIED:  { ring: "border-info",      soft: "bg-info-soft",       text: "text-info"   },
  DIRTY:     { ring: "border-warning",   soft: "bg-warning-soft",    text: "text-warning"},
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function elapsedMinutes(iso: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

export default function WaiterTableDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
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
    return () => { mounted = false; };
  }, [params.id]);

  // Tick cada 30s para refrescar "min en mesa" sin pegarle al backend.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const tone = useMemo(() => (table ? STATUS_TONE[table.status] : STATUS_TONE.AVAILABLE), [table]);
  const order = table?.activeOrder ?? null;

  return (
    <div className="h-full flex flex-col bg-surf-0">
      {/* HEADER */}
      <div className="p-4 border-b border-bd bg-surf-1 flex items-center gap-4 shrink-0">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-xl bg-surf-2 border border-bd flex items-center justify-center text-tx-sec active:scale-95 transition-all shrink-0"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex flex-col min-w-0">
          <span className="eyebrow !text-[10px]">
            {table?.zone
              ? `${table.zone.icon ? table.zone.icon + " " : ""}${table.zone.name.toUpperCase()}`
              : "DETALLE DE MESA"}
          </span>
          <h2 className="text-[18px] font-black leading-none truncate">
            {isLoading ? "Cargando…" : table ? table.name : "Mesa no encontrada"}
          </h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6 pb-32 scrollbar-hide">
        {isLoading ? (
          <>
            <div className="h-32 rounded-[2rem] bg-surf-1 animate-pulse" />
            <div className="h-48 rounded-[2rem] bg-surf-1 animate-pulse" />
          </>
        ) : errorMsg ? (
          <div className="p-6 rounded-2xl bg-danger-soft border border-danger text-danger text-[13px] font-bold">
            {errorMsg}
          </div>
        ) : table ? (
          <>
            {/* HERO CARD */}
            <div className={`p-5 sm:p-6 rounded-[2rem] border-2 flex items-center gap-4 sm:gap-6 ${tone.ring} ${tone.soft}`}>
              <div className={`w-16 h-16 sm:w-20 sm:h-20 bg-surf-1 rounded-3xl border-2 ${tone.ring} flex items-center justify-center font-black text-xl sm:text-2xl shadow-xl shrink-0 ${tone.text}`}>
                {table.name.replace(/^Mesa\s+/i, "").slice(0, 3).toUpperCase()}
              </div>
              <div className="flex-1 space-y-1 min-w-0">
                <div className={`font-black uppercase tracking-widest text-xs ${tone.text}`}>
                  {STATUS_COPY[table.status]}
                </div>
                {order ? (
                  <>
                    <div className="text-[13px] font-bold text-tx-sec truncate">
                      {order.customerName || "Sin nombre"} · desde {formatTime(order.createdAt)}
                    </div>
                    <div className={`mono tnum text-[12px] font-black ${tone.text}`}>
                      {elapsedMinutes(order.createdAt, now)} min en mesa
                    </div>
                  </>
                ) : (
                  <div className="text-[13px] font-bold text-tx-sec">
                    Sin cuenta abierta
                  </div>
                )}
              </div>
            </div>

            {/* ACCOUNT SUMMARY */}
            {order && (
              <div className="p-5 sm:p-6 rounded-[2rem] bg-surf-1 border border-bd space-y-5 sm:space-y-6">
                <div className="flex justify-between items-end gap-3">
                  <span className="eyebrow !text-[10px]">CUENTA ACUMULADA</span>
                  <div className="mono tnum text-2xl sm:text-3xl font-black">${order.total.toFixed(0)}</div>
                </div>

                {order.items.length === 0 ? (
                  <p className="text-[12px] text-tx-dis font-bold uppercase tracking-widest text-center py-4">
                    Sin items en la comanda
                  </p>
                ) : (
                  <div className="space-y-3">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex justify-between items-baseline gap-4 text-[13px] font-bold">
                        <span className="text-tx-sec truncate flex-1 min-w-0">
                          <span className="text-iris-500 mr-2">{item.quantity}×</span>
                          {item.name}
                        </span>
                        <span className="mono tnum text-tx-pri shrink-0">${item.subtotal.toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[10px] text-tx-dis font-bold uppercase tracking-widest text-center pt-2">
                  Los items se modifican desde el TPV principal
                </p>
              </div>
            )}

            {/* ACTIONS GRID */}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="soft" className="flex-col h-20 gap-2 rounded-2xl group" disabled={!order}>
                <Banknote size={20} className="group-active:scale-110 transition-transform" />
                <span className="text-[11px] font-black uppercase tracking-tighter">Pedir cuenta</span>
              </Button>
              <Button variant="soft" className="flex-col h-20 gap-2 rounded-2xl group">
                <Bell size={20} className="group-active:scale-110 transition-transform" />
                <span className="text-[11px] font-black uppercase tracking-tighter">Llamar TPV</span>
              </Button>
              <Button variant="soft" className="flex-col h-20 gap-2 rounded-2xl group" disabled={!order}>
                <Split size={20} className="group-active:scale-110 transition-transform" />
                <span className="text-[11px] font-black uppercase tracking-tighter">Dividir cuenta</span>
              </Button>
              <Button variant="soft" className="flex-col h-20 gap-2 rounded-2xl group" disabled={!order}>
                <Move size={20} className="group-active:scale-110 transition-transform" />
                <span className="text-[11px] font-black uppercase tracking-tighter">Cambiar mesa</span>
              </Button>
            </div>
          </>
        ) : null}
      </div>

      {/* STICKY BOTTOM CTA */}
      {!isLoading && table && (
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-surf-0 border-t border-bd backdrop-blur-xl">
          <Button
            variant="primary"
            fullWidth
            size="xl"
            className="h-14 font-black uppercase tracking-[0.1em] text-sm gap-3 shadow-2xl shadow-iris-glow"
            onClick={() => router.push(`/meseros/${table.id}/orden`)}
          >
            <Plus size={20} />
            Agregar a la comanda
          </Button>
        </div>
      )}
    </div>
  );
}
