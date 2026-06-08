"use client";
import React, { useMemo, useState } from "react";
import {
  X,
  Receipt,
  Search,
  Bike,
  ChevronRight,
  CheckCircle2,
  Circle,
  ListChecks,
  Merge,
  Loader2,
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
  /** Habilita la selección múltiple para consolidar cuentas abiertas. */
  canMergeOrders?: boolean;
  /** El primer ticket es el destino; el resto se cierra tras mover sus items. */
  onMergeOrders?: (
    targetOrder: DrawerOrder,
    sourceOrders: DrawerOrder[],
  ) => Promise<void>;
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

// Tonos de borde y dot por estado, alineados a la paleta diseño operativo.
const STATUS_TONE: Record<string, { dot: string; ring: string; chip: string }> = {
  READY:        { dot: "bg-[#88D66C]", ring: "border-[#88D66C]/40", chip: "text-[#88D66C]" },
  PREPARING:    { dot: "bg-[#ffb84d]", ring: "border-[#ffb84d]/40", chip: "text-[#ffb84d]" },
  CONFIRMED:    { dot: "bg-[#ffb84d]", ring: "border-[#ffb84d]/40", chip: "text-[#ffb84d]" },
  PENDING:      { dot: "bg-white/50",  ring: "border-white/15",     chip: "text-white/60" },
  OPEN:         { dot: "bg-white/50",  ring: "border-white/15",     chip: "text-white/60" },
  ON_THE_WAY:   { dot: "bg-blue-400", ring: "border-blue-400/40", chip: "text-blue-300" },
};

const DEFAULT_TONE = { dot: "bg-white/50", ring: "border-white/15", chip: "text-white/60" };
const toneFor = (status: string) => STATUS_TONE[status] ?? DEFAULT_TONE;

const OrdersDrawer: React.FC<OrdersDrawerProps> = ({
  isOpen,
  onClose,
  orders,
  onShowDetail,
  canMergeOrders = false,
  onMergeOrders,
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("Todos");
  const [search, setSearch] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

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

  const selectedOrders = useMemo(
    () =>
      selectedIds
        .map((id) => orders.find((order) => order.id === id))
        .filter((order): order is DrawerOrder => Boolean(order)),
    [orders, selectedIds],
  );

  const selectedTotal = useMemo(
    () => selectedOrders.reduce((sum, order) => sum + order.total, 0),
    [selectedOrders],
  );
  const targetOrder = selectedOrders[0];

  const resetSelection = () => {
    setSelectionMode(false);
    setSelectedIds([]);
    setShowMergeConfirm(false);
  };

  const handleClose = () => {
    resetSelection();
    onClose();
  };

  const toggleSelectionMode = () => {
    if (selectionMode) {
      resetSelection();
      return;
    }
    setSelectionMode(true);
  };

  const toggleOrder = (orderId: string) => {
    setSelectedIds((current) =>
      current.includes(orderId)
        ? current.filter((id) => id !== orderId)
        : [...current, orderId],
    );
  };

  const confirmMerge = async () => {
    const [destination, ...sources] = selectedOrders;
    if (!onMergeOrders || !destination || sources.length === 0) return;
    setIsMerging(true);
    try {
      await onMergeOrders(destination, sources);
      resetSelection();
    } catch {
      // El caller muestra el error y refresca las órdenes disponibles.
    } finally {
      setIsMerging(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex justify-end"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* OVERLAY */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={handleClose}
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
              {selectionMode ? "Seleccionar cuentas" : "Tickets abiertos"}
            </span>
            <span className="text-[16px] font-black text-white truncate leading-none">
              {selectionMode
                ? `${selectedOrders.length} seleccionada${selectedOrders.length === 1 ? "" : "s"}`
                : `${orders.length} en curso${
                    driverlessCount > 0 ? ` · ${driverlessCount} sin repartidor` : ""
                  }`}
            </span>
          </div>
          {canMergeOrders && (
            <button
              type="button"
              onClick={toggleSelectionMode}
              aria-label={selectionMode ? "Cancelar selección" : "Seleccionar varios tickets"}
              title={selectionMode ? "Cancelar selección" : "Seleccionar varios tickets"}
              className={`w-12 h-12 min-h-[48px] rounded-2xl border flex items-center justify-center active:scale-95 transition-all shrink-0 ${
                selectionMode
                  ? "bg-[#ffb84d] border-[#ffb84d] text-[#0C0C0E]"
                  : "bg-white/5 border-white/10 text-white/70"
              }`}
            >
              {selectionMode ? <X size={19} /> : <ListChecks size={19} />}
            </button>
          )}
          <button
            onClick={handleClose}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {visibleOrders.map((order) => {
                const tone = toneFor(order.status);
                const selectedIndex = selectedIds.indexOf(order.id);
                const isSelected = selectedIndex >= 0;
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() =>
                      selectionMode ? toggleOrder(order.id) : onShowDetail(order)
                    }
                    aria-pressed={selectionMode ? isSelected : undefined}
                    aria-label={
                      selectionMode
                        ? `${isSelected ? "Quitar" : "Seleccionar"} ticket de ${order.customerName}`
                        : `Abrir ticket de ${order.customerName} por $${order.total.toFixed(2)}`
                    }
                    className={`relative px-4 py-3 rounded-2xl border bg-white/5 backdrop-blur-md text-left flex items-center gap-3 active:scale-[0.98] transition-all overflow-hidden min-h-[72px] ${
                      isSelected
                        ? "border-[#ffb84d] bg-[#ffb84d]/10 shadow-[inset_0_0_0_1px_rgba(255,184,77,0.25)]"
                        : tone.ring
                    }`}
                  >
                    {selectionMode ? (
                      isSelected ? (
                        <CheckCircle2
                          size={21}
                          className="shrink-0 text-[#ffb84d]"
                          strokeWidth={2.5}
                        />
                      ) : (
                        <Circle size={21} className="shrink-0 text-white/30" />
                      )
                    ) : (
                      <span
                        className={`shrink-0 w-2.5 h-2.5 rounded-full ${tone.dot}`}
                        aria-label={order.status}
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="text-[15px] font-black text-white truncate leading-tight">
                          {order.customerName}
                        </h3>
                        {isSelected && (
                          <span className="shrink-0 text-[8px] font-black uppercase tracking-[0.12em] text-[#ffb84d]">
                            {selectedIndex === 0 ? "Cuenta final" : "Se juntará"}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-white/45">
                        <span className="text-[#ffb84d]">{order.type}</span>
                        <span className="text-white/20">·</span>
                        <span className="tabular-nums">#{order.orderNumber}</span>
                        {order.driver && (
                          <>
                            <span className="text-white/20">·</span>
                            <span className="inline-flex items-center gap-1 text-blue-300 truncate">
                              <Bike size={10} className="shrink-0" />
                              <span className="truncate normal-case">{order.driver}</span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <span className="tabular-nums text-lg font-black tracking-tight text-white">
                        ${order.total.toFixed(2)}
                      </span>
                      {!selectionMode && (
                        <ChevronRight size={16} className="text-white/40" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="relative z-10 p-4 border-t border-white/5 bg-[#0C0C0E] shrink-0">
          {selectionMode ? (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40">
                  Total combinado
                </div>
                <div className="text-xl font-black tabular-nums text-white">
                  ${selectedTotal.toFixed(2)}
                </div>
              </div>
              <button
                type="button"
                disabled={selectedOrders.length < 2}
                onClick={() => setShowMergeConfirm(true)}
                className="min-h-[52px] h-[52px] px-5 rounded-2xl bg-[#ffb84d] text-[#0C0C0E] text-[11px] font-black uppercase tracking-[0.12em] flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-30 disabled:active:scale-100"
              >
                <Merge size={17} strokeWidth={2.5} />
                Juntar {selectedOrders.length || ""}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="w-full min-h-[48px] h-12 rounded-2xl bg-white/5 border border-white/10 text-white/80 text-[11px] font-black uppercase tracking-[0.15em] flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              Ver historial completo
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      </aside>

      {showMergeConfirm && targetOrder && selectedOrders.length >= 2 && (
        <div className="absolute inset-0 z-[10] flex items-center justify-center p-5">
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
            onClick={() => !isMerging && setShowMergeConfirm(false)}
          />
          <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#111114] p-5 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-[#ffb84d]/15 border border-[#ffb84d]/30 text-[#ffb84d] flex items-center justify-center mb-4">
              <Merge size={21} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
              Confirmar unión
            </p>
            <h3 className="mt-1 text-xl font-black text-white">
              Juntar {selectedOrders.length} tickets
            </h3>
            <p className="mt-2 text-[13px] font-semibold leading-relaxed text-white/55">
              La cuenta final será #{targetOrder.orderNumber} de{" "}
              <span className="text-white">{targetOrder.customerName}</span>.
              Los otros {selectedOrders.length - 1} tickets se cerrarán después
              de mover sus productos.
            </p>
            <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="text-[11px] font-black uppercase tracking-[0.12em] text-white/45">
                Nuevo total
              </span>
              <span className="text-xl font-black tabular-nums text-white">
                ${selectedTotal.toFixed(2)}
              </span>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={isMerging}
                onClick={() => setShowMergeConfirm(false)}
                className="h-12 flex-1 rounded-2xl border border-white/10 bg-white/5 text-[11px] font-black uppercase tracking-[0.12em] text-white/65 disabled:opacity-40"
              >
                Volver
              </button>
              <button
                type="button"
                disabled={isMerging}
                onClick={confirmMerge}
                className="h-12 flex-[1.5] rounded-2xl bg-[#ffb84d] text-[11px] font-black uppercase tracking-[0.12em] text-[#0C0C0E] flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
              >
                {isMerging ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Juntando
                  </>
                ) : (
                  <>
                    <Merge size={16} />
                    Confirmar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrdersDrawer;
