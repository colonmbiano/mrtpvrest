"use client";
import React, { useMemo, useState } from "react";
import {
  X,
  Receipt,
  Search,
  Bike,
  Printer,
  ChevronRight,
  Banknote,
} from "lucide-react";

export interface DrawerOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  type: string; // MESA / LLEVAR / DOMICILIO
  status: string;
  total: number;
  time: string;
  itemsCount: number;
  driver?: string;
  needsDriver?: boolean;
}

interface OrdersDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  orders: DrawerOrder[];
  /** Tap sobre el cuerpo del tile → modal de detalle (solo lectura). */
  onShowDetail: (order: DrawerOrder) => void;
  /** Botón primario "Cobrar" → flujo de pago. */
  onConfirmPayment: (order: DrawerOrder) => void;
  /** Botón secundario "Reimprimir" → ticket cuenta a impresora CASHIER. */
  onReprintOrder: (order: DrawerOrder) => void;
  /** Fase 6: oculta el botón Cobrar cuando el usuario es WAITER en
   *  modo préstamo. Conserva ver detalle y reimprimir. */
  hideMoney?: boolean;
}

const FILTERS = ["Todos", "Mesa", "Llevar", "Domicilio"] as const;
type FilterKey = (typeof FILTERS)[number];

const matchesFilter = (order: DrawerOrder, filter: FilterKey): boolean => {
  if (filter === "Todos") return true;
  const t = (order.type || "").toUpperCase();
  if (filter === "Mesa") return t === "MESA" || t === "DINE_IN";
  if (filter === "Llevar") return t === "LLEVAR" || t === "TAKEOUT";
  if (filter === "Domicilio") return t === "DOMICILIO" || t === "DELIVERY";
  return true;
};

// Tonos de borde y dot por estado, alineados a la paleta Warm Tech.
const STATUS_TONE: Record<string, { dot: string; ring: string; chip: string }> = {
  READY:        { dot: "bg-[#88D66C]", ring: "border-[#88D66C]/40", chip: "text-[#88D66C]" },
  PREPARING:    { dot: "bg-[#ffb84d]", ring: "border-[#ffb84d]/40", chip: "text-[#ffb84d]" },
  CONFIRMED:    { dot: "bg-[#ffb84d]", ring: "border-[#ffb84d]/40", chip: "text-[#ffb84d]" },
  PENDING:      { dot: "bg-white/50",  ring: "border-white/15",     chip: "text-white/60" },
  OPEN:         { dot: "bg-white/50",  ring: "border-white/15",     chip: "text-white/60" },
  OUT_FOR_DELIVERY: { dot: "bg-blue-400", ring: "border-blue-400/40", chip: "text-blue-300" },
};

const toneFor = (status: string) => STATUS_TONE[status] ?? STATUS_TONE.PENDING;

const OrdersDrawer: React.FC<OrdersDrawerProps> = ({
  isOpen,
  onClose,
  orders,
  onShowDetail,
  onConfirmPayment,
  onReprintOrder,
  hideMoney = false,
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("Todos");
  const [search, setSearch] = useState("");

  const visibleOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => matchesFilter(o, activeFilter))
      .filter((o) => {
        if (!q) return true;
        return (
          o.customerName?.toLowerCase().includes(q) ||
          o.orderNumber?.toLowerCase().includes(q)
        );
      });
  }, [orders, activeFilter, search]);

  const driverlessCount = useMemo(
    () => orders.filter((o) => o.needsDriver).length,
    [orders]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex justify-end"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* OVERLAY */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* DRAWER */}
      <aside className="relative w-full max-w-[560px] h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 ease-out overflow-hidden bg-[#0C0C0E] text-white border-l border-white/10">
        {/* Glows */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: 700,
            height: 700,
            top: -150,
            right: -250,
            background:
              "radial-gradient(circle, rgba(255,184,77,0.18) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            width: 700,
            height: 700,
            bottom: -150,
            left: -250,
            background:
              "radial-gradient(circle, rgba(136,214,108,0.10) 0%, transparent 70%)",
          }}
        />

        {/* HEADER */}
        <div className="relative z-10 p-5 border-b border-white/5 flex items-center gap-4 shrink-0 bg-white/5 backdrop-blur-md">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#ffb84d]/15 text-[#ffb84d] border border-[#ffb84d]/30 shrink-0">
            <Receipt size={22} />
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
              Tickets abiertos
            </span>
            <span className="text-[16px] font-black text-white truncate leading-none">
              {orders.length} en curso
              {driverlessCount > 0 ? ` · ${driverlessCount} sin repartidor` : ""}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-12 h-12 min-h-[48px] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 active:scale-95 transition-transform shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* FILTERS & SEARCH */}
        <div className="relative z-10 p-4 border-b border-white/5 space-y-3 shrink-0">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {FILTERS.map((f) => {
              const isActive = activeFilter === f;
              return (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`shrink-0 h-11 min-h-[44px] px-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.15em] whitespace-nowrap active:scale-95 transition-all border ${
                    isActive
                      ? "bg-[#ffb84d] text-[#0C0C0E] border-[#ffb84d] shadow-[0_5px_20px_rgba(255,184,77,0.3)]"
                      : "bg-white/5 text-white/60 border-white/10"
                  }`}
                >
                  {f}
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40"
              size={16}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por cliente o #orden..."
              className="w-full h-12 min-h-[48px] bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 text-[13px] text-white focus:outline-none focus:border-[#ffb84d] transition-colors placeholder:text-white/30"
            />
          </div>
        </div>

        {/* TILE GRID — 2 cols touch */}
        <div className="relative z-10 flex-1 overflow-y-auto scrollbar-hide p-3">
          {visibleOrders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-40 gap-4 py-16">
              <Receipt size={48} className="text-white/30" />
              <p className="text-[12px] font-bold tracking-widest uppercase text-white/40">
                {orders.length === 0 ? "No hay tickets activos" : "Sin coincidencias"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visibleOrders.map((order) => {
                const tone = toneFor(order.status);
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => onShowDetail(order)}
                    className={`relative p-4 rounded-3xl border-2 ${tone.ring} bg-white/5 backdrop-blur-md text-left flex flex-col gap-3 active:scale-[0.98] transition-transform overflow-hidden`}
                  >
                    {/* Glow accent */}
                    <div
                      aria-hidden
                      className="absolute pointer-events-none -top-12 -right-12 w-32 h-32 rounded-full opacity-30 blur-2xl"
                      style={{
                        background:
                          "radial-gradient(circle, rgba(255,184,77,0.4) 0%, transparent 70%)",
                      }}
                    />

                    {/* TOP ROW: order# + status */}
                    <div className="relative z-10 flex items-start justify-between gap-2">
                      <div className="flex flex-col min-w-0">
                        <span className="tabular-nums text-[10px] font-black text-white/50 tracking-wider uppercase">
                          #{order.orderNumber}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[#ffb84d] mt-0.5">
                          {order.type}
                        </span>
                      </div>
                      <div
                        className={`flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-white/5 border border-white/10 ${tone.chip}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${tone.dot}`} />
                        <span className="text-[10px] font-black uppercase tracking-widest">
                          {order.status}
                        </span>
                      </div>
                    </div>

                    {/* CUSTOMER */}
                    <div className="relative z-10 min-w-0">
                      <h3 className="text-[16px] font-black text-white truncate leading-tight">
                        {order.customerName}
                      </h3>
                      <p className="text-[11px] font-bold text-white/50 mt-0.5">
                        {order.itemsCount} prod · hace {order.time}
                      </p>
                      {order.driver && (
                        <div className="flex items-center gap-1.5 mt-1.5 text-white/70">
                          <Bike size={12} />
                          <span className="text-[11px] font-bold truncate">
                            {order.driver}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* TOTAL */}
                    <div className="relative z-10 tabular-nums text-3xl font-black tracking-tight text-white">
                      ${order.total.toFixed(2)}
                    </div>

                    {/* PRIMARY ACTION — oculto en modo préstamo */}
                    {!hideMoney && (
                      <div
                        className="relative z-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onConfirmPayment(order);
                          }}
                          className="w-full min-h-[64px] h-14 rounded-2xl bg-[#ffb84d] text-[#0C0C0E] text-[12px] font-black uppercase tracking-[0.15em] flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-[0_10px_30px_rgba(255,184,77,0.3)]"
                        >
                          <Banknote size={16} strokeWidth={2.5} />
                          Cobrar
                        </button>
                      </div>
                    )}

                    {/* SECONDARY: REPRINT */}
                    <div
                      className="relative z-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReprintOrder(order);
                        }}
                        className="w-full h-10 rounded-xl bg-transparent border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 active:scale-95 transition-transform"
                      >
                        <Printer size={12} />
                        Reimprimir cuenta
                      </button>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="relative z-10 p-4 border-t border-white/5 bg-[#0C0C0E] shrink-0">
          <button
            type="button"
            className="w-full min-h-[48px] h-12 rounded-2xl bg-white/5 border border-white/10 text-white/80 text-[11px] font-black uppercase tracking-[0.15em] flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            Ver historial completo
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
    </div>
  );
};

export default OrdersDrawer;
