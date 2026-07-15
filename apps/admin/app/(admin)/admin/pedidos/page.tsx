"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Flame, Home, Inbox, RotateCw, Wallet, X } from "lucide-react";
import api from "@/lib/api";
import { formatMoney } from "@/lib/format";
import {
  Button, EmptyState, IconButton, Modal, PageHeader, PageShell, Pill,
  Segmented, Select, Skeleton, StatTile, Toolbar, useToast,
} from "@/components/ds";
import OrderCard from "./_components/OrderCard";
import OrdersKanban from "./_components/OrdersKanban";
import { STATUSES, type Driver, type Order, type StatusKey } from "./_components/orders";

export default function PedidosPage() {
  const toast = useToast();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"kanban" | "list">("list");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [search, setSearch] = useState("");
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [cobrarOrder, setCobrarOrder] = useState<Order | null>(null);

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
      toast.error(err?.response?.data?.error || "Error al cambiar estado");
    }
  }

  async function assignDriver(orderId: string, driverId: string) {
    try {
      await api.put("/api/delivery/assign", { orderId, driverId });
      setOrders((prev) => prev.map((o) =>
        o.id === orderId ? { ...o, deliveryDriverId: driverId, status: "ON_THE_WAY" } : o));
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || "Error al asignar repartidor");
    }
  }

  async function unassignDriver(orderId: string) {
    try {
      await api.put("/api/delivery/unassign", { orderId });
      setOrders((prev) => prev.map((o) =>
        o.id === orderId ? { ...o, deliveryDriverId: undefined, status: "READY" } : o));
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || "Error al desasignar repartidor");
    }
  }

  // Cobra el pedido desde el tablero sin saltar su estado operativo
  // (keepStatus). El total lo recalcula el backend; aquí solo el método.
  async function cobrar(orderId: string, paymentMethod: string) {
    try {
      await api.put(`/api/orders/${orderId}/payment`, { paymentMethod, keepStatus: true });
      setOrders((prev) => prev.map((o) =>
        o.id === orderId
          ? { ...o, paymentStatus: "PAID", cashCollected: paymentMethod === "CASH", paymentMethod }
          : o));
      setCobrarOrder(null);
      toast.success("Pedido cobrado");
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || "Error al cobrar el pedido");
    }
  }

  async function printTicket(orderId: string) {
    try {
      await api.post(`/api/orders/${orderId}/print-bill`);
      toast.success("Ticket enviado a impresión");
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || "No se pudo imprimir");
    }
  }

  // Abre el hilo de WhatsApp que originó el pedido. No hay FK Order↔conversación:
  // se resuelve por teléfono del cliente en la bandeja de entrada.
  function openConversation(order: Order) {
    const digits = (order.customerPhone || "").replace(/\D/g, "");
    if (!digits) return;
    router.push(`/admin/inbox?phone=${digits}`);
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
    <PageShell>
      <PageHeader
        eyebrow="Operación en vivo"
        title="Pedidos"
        subtitle="Recibe, avanza y entrega los pedidos de todos los canales."
        actions={
          <>
            <Pill tone="ok" live>Actualizado {updatedLabel}</Pill>
            <Segmented
              value={view}
              onChange={setView}
              options={[{ value: "list", label: "Lista" }, { value: "kanban", label: "Kanban" }] as const}
              className="w-[220px]"
            />
            <IconButton icon={RotateCw} label="Refrescar" onClick={fetchData} size={44} />
          </>
        }
      />

      {/* indicador live + toggle de vista en móvil (el título lo pone MobileAdminChrome) */}
      <div className="mb-3 flex items-center justify-between gap-2 md:hidden">
        <Pill tone="ok" live>Actualizado {updatedLabel}</Pill>
        <Segmented
          value={view}
          onChange={setView}
          options={[{ value: "list", label: "Lista" }, { value: "kanban", label: "Kanban" }] as const}
        />
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon={Flame} value={active.length} label="Activos" />
        <StatTile icon={Inbox} value={pending} label="Pendientes" />
        <StatTile icon={CheckCircle2} value={todayDelivered.length} label="Hoy entregados" />
        <StatTile icon={Home} value={formatMoney(todayRevenue, false)} label="Ingresos hoy" />
      </div>

      {/* filtros */}
      <Toolbar
        className="mt-4"
        search={{ value: search, onChange: setSearch, placeholder: "Buscar pedido, cliente…" }}
        filters={
          <>
            <div className="min-w-[170px]">
              <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">Todos los estados</option>
                {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </Select>
            </div>
            <div className="min-w-[170px]">
              <Select value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
                <option value="all">Todos los orígenes</option>
                <option value="ONLINE">Online</option>
                <option value="TPV">TPV</option>
                <option value="WAITER">Mesero</option>
              </Select>
            </div>
            {hasFilters && (
              <Button
                variant="danger"
                icon={X}
                onClick={() => { setFilterStatus("all"); setFilterSource("all"); setSearch(""); }}
              >
                Limpiar
              </Button>
            )}
          </>
        }
      />

      {/* contenido */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-ds-lg" />)}
        </div>
      ) : view === "kanban" ? (
        <OrdersKanban
          orders={filtered}
          drivers={drivers}
          onStatusChange={changeStatus}
          onAssignDriver={assignDriver}
          onUnassignDriver={unassignDriver}
          onCobrar={setCobrarOrder}
          onPrint={printTicket}
          onOpenConversation={openConversation}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Sin pedidos que mostrar"
          hint={hasFilters ? "Prueba quitar los filtros activos." : "Los nuevos pedidos aparecerán aquí en vivo."}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              drivers={drivers}
              onStatusChange={changeStatus}
              onAssignDriver={assignDriver}
              onUnassignDriver={unassignDriver}
              onCobrar={setCobrarOrder}
              onPrint={printTicket}
              onOpenConversation={openConversation}
            />
          ))}
        </div>
      )}

      <CobrarModal
        order={cobrarOrder}
        onClose={() => setCobrarOrder(null)}
        onConfirm={cobrar}
      />
    </PageShell>
  );
}

/* ── Modal de cobro desde el tablero ─────────────────────────────── */
const PAY_METHODS: { value: string; label: string }[] = [
  { value: "CASH", label: "Efectivo" },
  { value: "CARD", label: "Tarjeta" },
  { value: "TRANSFER", label: "Transferencia" },
];

function CobrarModal({
  order,
  onClose,
  onConfirm,
}: {
  order: Order | null;
  onClose: () => void;
  onConfirm: (orderId: string, method: string) => Promise<void>;
}) {
  const [method, setMethod] = useState("CASH");
  const [saving, setSaving] = useState(false);

  async function confirm() {
    if (!order || saving) return;
    setSaving(true);
    try {
      await onConfirm(order.id, method);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={Boolean(order)}
      onClose={() => !saving && onClose()}
      title="Cobrar pedido"
      subtitle={order ? `${order.orderNumber} · ${formatMoney(order.total ?? 0)}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button icon={Wallet} onClick={confirm} disabled={saving} loading={saving}>
            {saving ? "Cobrando…" : "Confirmar cobro"}
          </Button>
        </>
      }
    >
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Método de pago</div>
      <div className="grid grid-cols-3 gap-2">
        {PAY_METHODS.map((m) => {
          const activeM = method === m.value;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => setMethod(m.value)}
              className="rounded-ds-md py-2.5 text-xs font-bold transition-colors"
              style={{
                background: activeM ? "var(--ok)" : "var(--surf-2)",
                color: activeM ? "#fff" : "var(--tx)",
                border: `1px solid ${activeM ? "var(--ok)" : "var(--bd-1)"}`,
              }}
            >
              {m.label}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
