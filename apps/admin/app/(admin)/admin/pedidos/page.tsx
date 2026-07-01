"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ChevronDown, ChevronUp, Inbox, CheckCircle2, ChefHat, BellRing,
  Bike, Home, MessageCircle, X, RotateCw, LayoutGrid, List, Search,
  Flame, Store, MapPin, StickyNote, Package,
} from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen, PageHeader, WtCard, StatTile, Pill, Segmented, PrimaryBtn,
  EmptyState, money, type Tone,
} from "@/components/warmtech";

/* ── status model ────────────────────────────────────────────────── */
type StatusKey =
  | "PENDING" | "CONFIRMED" | "PREPARING" | "READY" | "PACKING"
  | "ON_THE_WAY" | "DELIVERED" | "CANCELLED";

const STATUSES: { key: StatusKey; label: string; icon: typeof Inbox; tone: Tone }[] = [
  { key: "PENDING",    label: "Pendientes",  icon: Inbox,        tone: "warn" },
  { key: "CONFIRMED",  label: "Confirmados", icon: CheckCircle2, tone: "info" },
  { key: "PREPARING",  label: "Preparando",  icon: ChefHat,      tone: "ac"   },
  { key: "READY",      label: "Listos",      icon: BellRing,     tone: "info" },
  { key: "PACKING",    label: "En empaque",  icon: Package,      tone: "ac"   },
  { key: "ON_THE_WAY", label: "En camino",   icon: Bike,         tone: "ac"   },
  { key: "DELIVERED",  label: "Entregados",  icon: Home,         tone: "ok"   },
];

const STATUS_META: Record<string, { label: string; icon: typeof Inbox; tone: Tone }> =
  Object.fromEntries(STATUSES.map((s) => [s.key, s]));

// Avance por defecto. READY → ON_THE_WAY se mantiene (la mayoría no usa empaque);
// PACKING (cuando el tenant lo activa) avanza a ON_THE_WAY.
const NEXT_STATUS: Record<string, StatusKey> = {
  PENDING: "CONFIRMED", CONFIRMED: "PREPARING",
  PREPARING: "READY", READY: "ON_THE_WAY", PACKING: "ON_THE_WAY", ON_THE_WAY: "DELIVERED",
};

const SOURCE_LABELS: Record<string, string> = {
  ONLINE: "Online", TPV: "TPV", WAITER: "Mesero",
};

const TONE_FG: Record<Tone, string> = {
  ac: "var(--brand-primary)", ok: "var(--ok)", warn: "var(--warn)",
  err: "var(--err)", info: "var(--info)", neutral: "var(--tx-mut)",
};

interface OrderItem { id: string; name: string; quantity: number; price: number; notes?: string }
interface Order {
  id: string; orderNumber: string; status: StatusKey;
  customerName?: string; customerPhone?: string; user?: { name?: string };
  total?: number; source?: string; orderType?: string; paymentMethod?: string;
  paymentStatus?: string; cashCollected?: boolean;
  createdAt: string; updatedAt: string;
  items?: OrderItem[]; deliveryAddress?: string; notes?: string;
  deliveryDriverId?: string;
}
interface Driver { id: string; name: string; phone?: string }

function timeAgo(date: string) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (diff < 1) return "ahora";
  if (diff < 60) return `${diff}m`;
  return `${Math.floor(diff / 60)}h ${diff % 60}m`;
}

/* ── order card ──────────────────────────────────────────────────── */
function OrderCard({ order, drivers, onStatusChange, onAssignDriver, onUnassignDriver }: {
  order: Order; drivers: Driver[];
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
    <WtCard
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
          <div className="font-display text-base font-extrabold text-primary">{money(order.total ?? 0)}</div>
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
              <span className="font-mono text-tx-mut">{money(item.price * item.quantity)}</span>
            </div>
          ))}
          {order.deliveryAddress && (
            <div className="mt-1 flex items-start gap-2 rounded-xl p-2 text-xs text-tx-mut"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
              <MapPin size={13} className="mt-0.5 shrink-0" /> {order.deliveryAddress}
            </div>
          )}
          {order.notes && (
            <div className="flex items-start gap-2 rounded-xl p-2 text-xs"
              style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
              <StickyNote size={13} className="mt-0.5 shrink-0" /> {order.notes}
            </div>
          )}
          {order.orderType === "DELIVERY" && ["READY", "ON_THE_WAY"].includes(order.status) && (
            <div className="mt-1">
              <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Repartidor</div>
              <div className="flex gap-2">
                <select
                  value={order.deliveryDriverId || ""}
                  onChange={(e) => { if (e.target.value) onAssignDriver(order.id, e.target.value); }}
                  className="flex-1 rounded-xl px-3 py-2 text-xs outline-none"
                  style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                >
                  <option value="">— Seleccionar repartidor —</option>
                  {drivers.map((d) => <option key={d.id} value={d.id}>{d.name} {d.phone ? `(${d.phone})` : ""}</option>)}
                </select>
                {order.deliveryDriverId && (
                  <button
                    type="button"
                    onClick={() => onUnassignDriver(order.id)}
                    aria-label="Desasignar repartidor"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
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
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-tx-mut"
          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
        >
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>

        {order.customerPhone && (
          <a
            href={`https://wa.me/52${order.customerPhone.replace(/\D/g, "")}`}
            target="_blank" rel="noopener noreferrer"
            aria-label="WhatsApp"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{ background: "var(--ok-soft)", color: "var(--ok)" }}
          >
            <MessageCircle size={16} />
          </a>
        )}

        {nextStatus && nextMeta && (
          <button
            type="button"
            onClick={() => onStatusChange(order.id, nextStatus)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 font-display text-xs font-extrabold text-white transition-transform active:scale-95"
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
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{ background: "var(--err-soft)", color: "var(--err)" }}
          >
            <X size={15} strokeWidth={2.4} />
          </button>
        )}
      </div>
    </WtCard>
  );
}

/* ── page ────────────────────────────────────────────────────────── */
export default function PedidosPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"kanban" | "list">("list");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [search, setSearch] = useState("");
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const fetchData = useCallback(async () => {
    try {
      const [ordersRes, driversRes] = await Promise.all([
        api.get<Order[]>("/api/orders/admin"),
        api.get<Driver[]>("/api/delivery"),
      ]);
      setOrders(ordersRes.data);
      setDrivers(driversRes.data);
      setLastUpdate(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const startPolling = () => {
      fetchData();
      interval = setInterval(fetchData, 8000);
    };
    const locationId = localStorage.getItem("locationId");
    if (locationId) {
      startPolling();
    } else {
      const handleReady = () => {
        startPolling();
        window.removeEventListener("locationChanged", handleReady);
      };
      window.addEventListener("locationChanged", handleReady);
      return () => {
        window.removeEventListener("locationChanged", handleReady);
        clearInterval(interval);
      };
    }
    return () => clearInterval(interval);
  }, [fetchData]);

  async function changeStatus(orderId: string, status: string) {
    try {
      await api.put(`/api/orders/${orderId}/status`, { status });
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: status as StatusKey } : o)));
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      alert(err?.response?.data?.error || "Error al cambiar estado");
    }
  }

  async function assignDriver(orderId: string, driverId: string) {
    try {
      await api.put("/api/delivery/assign", { orderId, driverId });
      setOrders((prev) => prev.map((o) =>
        o.id === orderId ? { ...o, deliveryDriverId: driverId, status: "ON_THE_WAY" } : o));
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      alert(err?.response?.data?.error || "Error al asignar repartidor");
    }
  }

  async function unassignDriver(orderId: string) {
    try {
      await api.put("/api/delivery/unassign", { orderId });
      setOrders((prev) => prev.map((o) =>
        o.id === orderId ? { ...o, deliveryDriverId: undefined, status: "READY" } : o));
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      alert(err?.response?.data?.error || "Error al desasignar repartidor");
    }
  }

  const filtered = useMemo(() => orders.filter((o) => {
    if (filterStatus !== "all" && o.status !== filterStatus) return false;
    if (filterSource !== "all" && o.source !== filterSource) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        o.orderNumber?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.customerPhone?.includes(q)
      );
    }
    return true;
  }), [orders, filterStatus, filterSource, search]);

  const active = orders.filter((o) => !["DELIVERED", "CANCELLED"].includes(o.status));
  const pending = orders.filter((o) => o.status === "PENDING").length;
  const todayDelivered = orders.filter((o) =>
    o.status === "DELIVERED" && new Date(o.updatedAt).toDateString() === new Date().toDateString());
  const todayRevenue = todayDelivered.reduce((s, o) => s + (o.total || 0), 0);

  const hasFilters = filterStatus !== "all" || filterSource !== "all" || Boolean(search);
  const updatedLabel = lastUpdate.toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" });

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Operación en vivo"
        title="Pedidos"
        subtitle={`Actualizado ${updatedLabel}`}
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              options={[{ value: "list", label: "Lista" }, { value: "kanban", label: "Kanban" }] as const}
              className="md:max-w-[220px]"
            />
            <button
              type="button" onClick={fetchData} aria-label="Refrescar"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-tx-mut"
              style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
            >
              <RotateCw size={17} />
            </button>
          </>
        }
      />

      {/* mobile live indicator */}
      <div className="mb-3 flex items-center gap-2 md:hidden">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--ok)" }} />
        <span className="text-[11px] text-tx-mut">Actualizado {updatedLabel}</span>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon={Flame} value={active.length} label="Activos" />
        <StatTile icon={Inbox} value={pending} label="Pendientes" />
        <StatTile icon={CheckCircle2} value={todayDelivered.length} label="Hoy entregados" />
        <StatTile icon={Home} value={money(todayRevenue)} label="Ingresos hoy" />
      </div>

      {/* filters */}
      <WtCard className="mt-4 flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[160px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tx-mut" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pedido, cliente…"
            className="min-h-11 w-full rounded-xl pl-9 pr-3 text-sm outline-none"
            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
          />
        </div>
        <select
          value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="min-h-11 rounded-xl px-3 text-sm outline-none"
          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
        >
          <option value="all">Todos los estados</option>
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select
          value={filterSource} onChange={(e) => setFilterSource(e.target.value)}
          className="min-h-11 rounded-xl px-3 text-sm outline-none"
          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
        >
          <option value="all">Todos los orígenes</option>
          <option value="ONLINE">Online</option>
          <option value="TPV">TPV</option>
          <option value="WAITER">Mesero</option>
        </select>
        {hasFilters && (
          <PrimaryBtn full={false} danger icon={X}
            onClick={() => { setFilterStatus("all"); setFilterSource("all"); setSearch(""); }}>
            Limpiar
          </PrimaryBtn>
        )}
      </WtCard>

      {/* content */}
      <div className="mt-4">
        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-40 animate-pulse rounded-[18px] bg-surf-2" />)}
          </div>
        ) : view === "kanban" ? (
          <div className="flex gap-4 overflow-x-auto pb-4 warmtech-scrollbar">
            {STATUSES.map((col) => {
              const colOrders = filtered.filter((o) => o.status === col.key);
              const ColIcon = col.icon;
              return (
                <div key={col.key} className="flex w-[290px] shrink-0 flex-col gap-3">
                  <div className="flex items-center justify-between rounded-xl px-3 py-2.5"
                    style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                    <div className="flex items-center gap-2" style={{ color: TONE_FG[col.tone] }}>
                      <ColIcon size={15} strokeWidth={2} />
                      <span className="font-display text-xs font-extrabold uppercase tracking-wider">{col.label}</span>
                    </div>
                    <span className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-extrabold text-white"
                      style={{ background: TONE_FG[col.tone] }}>{colOrders.length}</span>
                  </div>
                  {colOrders.length === 0 ? (
                    <div className="rounded-2xl py-10 text-center text-xs text-tx-mut"
                      style={{ border: "1px dashed var(--bd-1)" }}>Sin pedidos</div>
                  ) : (
                    colOrders.map((o) => (
                      <OrderCard key={o.id} order={o} drivers={drivers}
                        onStatusChange={changeStatus} onAssignDriver={assignDriver} onUnassignDriver={unassignDriver} />
                    ))
                  )}
                </div>
              );
            })}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Inbox} title="Sin pedidos que mostrar"
            hint={hasFilters ? "Prueba quitar los filtros activos." : "Los nuevos pedidos aparecerán aquí en vivo."} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((o) => (
              <OrderCard key={o.id} order={o} drivers={drivers}
                onStatusChange={changeStatus} onAssignDriver={assignDriver} onUnassignDriver={unassignDriver} />
            ))}
          </div>
        )}
      </div>
    </WtScreen>
  );
}
