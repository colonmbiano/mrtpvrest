"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Info, Wifi, WifiOff, Server, ServerOff,
  X, Check, ListChecks, Bike, Utensils, ShoppingBag,
  Trophy, RefreshCcw, LogOut, Radio, Trash2,
} from "lucide-react";
import api from "@/lib/api";
import NumpadPIN from "@/components/NumpadPIN";
import { startTcpListener, stopTcpListener, listenForData } from "@/lib/tcpListener";
import { parseEscPos } from "@/lib/escpos-parser";

// ── Tipos ─────────────────────────────────────────────────────────────────

type StationCode = "KITCHEN" | "BAR" | "FRYER";
type TabKey = "orders" | "tasks" | "tcp";

/**
 * Comanda recibida vía TCP (ESC/POS) desde el TPV actuando como
 * impresora térmica. KDS escucha en port 9100; cada payload se
 * convierte en un card. Estado solo en memoria — los tickets TCP son
 * efímeros como una comanda en papel.
 */
interface TcpTicket {
  id: string;
  receivedAt: number;
  from: string;
  lines: string[];
  isKitchen: boolean;
  isReceipt: boolean;
  orderNumber: string | null;
  tableLabel: string | null;
}

interface KdsOrderItem {
  id: string;
  menuItemName: string;
  quantity: number;
  done: boolean;
  notes?: string | null;
  station?: string | null;
}

interface KdsOrder {
  id: string;
  orderNumber: string;
  orderType: "DINE_IN" | "TAKEOUT" | "DELIVERY";
  tableNumber?: string | null;
  customerName?: string | null;
  createdAt: string;
  items: KdsOrderItem[];
  allDone?: boolean;
}

interface KdsTask {
  id: string;
  title: string;
  description: string | null;
  type: string;
  pointsReward: number;
  frequency: string | null;
}

interface PendingTaskLog {
  clientId: string;
  taskId: string;
  pin: string;
  notes?: string | null;
  enqueuedAt: string;
}

const STATIONS: Array<{ value: StationCode; label: string; color: string }> = [
  { value: "KITCHEN", label: "Cocina",   color: "#ef4444" },
  { value: "BAR",     label: "Barra",    color: "#3b82f6" },
  { value: "FRYER",   label: "Freidora", color: "#f97316" },
];

const ORDER_TYPE_ICONS: Record<KdsOrder["orderType"], React.ReactNode> = {
  DINE_IN:  <Utensils size={14} />,
  TAKEOUT:  <ShoppingBag size={14} />,
  DELIVERY: <Bike size={14} />,
};

const PENDING_LOGS_KEY = "kds-pending-task-logs";

function minutesElapsed(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

function urgencyOf(mins: number): { color: string; label: string; bg: string } {
  if (mins >= 15) return { color: "#ef4444", label: "URGENTE",  bg: "rgba(239,68,68,0.15)" };
  if (mins >= 8)  return { color: "#f59e0b", label: "DEMORADO", bg: "rgba(245,158,11,0.12)" };
  return { color: "#22c55e", label: "OK", bg: "rgba(34,197,94,0.10)" };
}

function readPendingLogs(): PendingTaskLog[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_LOGS_KEY);
    return raw ? (JSON.parse(raw) as PendingTaskLog[]) : [];
  } catch { return []; }
}

function writePendingLogs(logs: PendingTaskLog[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PENDING_LOGS_KEY, JSON.stringify(logs));
}

interface KdsScreenProps {
  onLogout: () => void;
}

export default function KdsScreen({ onLogout }: KdsScreenProps) {
  const [tab, setTab]               = useState<TabKey>("orders");
  const [station, setStation]       = useState<StationCode>("KITCHEN");

  const [orders, setOrders]         = useState<KdsOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [now, setNow]               = useState<number>(Date.now());
  const prevIds                     = useRef<string[]>([]);

  const [tasks, setTasks]           = useState<KdsTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskPinFor, setTaskPinFor] = useState<KdsTask | null>(null);
  const [taskPinError, setTaskPinError] = useState<string>("");
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [recentXp, setRecentXp]     = useState<{ task: string; points: number; ts: number } | null>(null);

  const [online, setOnline]         = useState<boolean>(true);
  const [serverOk, setServerOk]     = useState<boolean>(true);
  const [showInfo, setShowInfo]     = useState<boolean>(false);
  const [showLogout, setShowLogout] = useState<boolean>(false);

  // Tickets recibidos por TCP (KDS-as-printer). Estado efímero.
  const [tcpTickets, setTcpTickets] = useState<TcpTicket[]>([]);
  const [tcpListening, setTcpListening] = useState<boolean>(false);

  // Arranca el TCP listener en port 9100 al montar; al desmontar (o
  // logout) lo detiene. listenForData mantiene una sola subscripción
  // viva — `parseEscPos` traduce el binario a líneas legibles y
  // pusheamos el ticket al tope de la lista.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await startTcpListener(9100);
        if (cancelled) return;
        setTcpListening(true);
        await listenForData((ev) => {
          const parsed = parseEscPos(ev.text);
          if (parsed.lines.length === 0) return;
          const ticket: TcpTicket = {
            id: `tcp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            receivedAt: Date.now(),
            from: ev.from,
            lines: parsed.lines,
            isKitchen: parsed.isKitchen,
            isReceipt: parsed.isReceipt,
            orderNumber: parsed.orderNumber,
            tableLabel: parsed.tableLabel,
          };
          setTcpTickets((curr) => [ticket, ...curr].slice(0, 50));
        });
      } catch {
        // Plugin no disponible (web build) o port ocupado: el KDS sigue
        // funcionando con el polling /api/kds/orders, solo no recibe
        // comandas vía TCP. No es bloqueante.
        if (!cancelled) setTcpListening(false);
      }
    })();
    return () => {
      cancelled = true;
      stopTcpListener().catch(() => { /* noop */ });
    };
  }, []);

  // Network listeners
  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    const onOnline = () => { flushPendingLogs().catch(() => {}); };
    window.addEventListener("online", onOnline);
    setPendingCount(readPendingLogs().length);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // Reloj urgencias
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Polling órdenes
  const fetchOrders = useCallback(async () => {
    try {
      const { data } = await api.get<KdsOrder[]>(`/api/kds/orders/${station}`);
      setServerOk(true);
      const newIds = data.map((o) => o.id);
      if (prevIds.current.length > 0 && newIds.some((id) => !prevIds.current.includes(id))) {
        playBeep();
      }
      prevIds.current = newIds;
      setOrders(data);
    } catch {
      setServerOk(false);
    } finally {
      setLoadingOrders(false);
    }
  }, [station]);

  useEffect(() => {
    setLoadingOrders(true);
    fetchOrders();
    const t = setInterval(fetchOrders, 12_000);
    return () => clearInterval(t);
  }, [fetchOrders]);

  // Polling tareas
  const fetchTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const { data } = await api.get<KdsTask[]>("/api/tasks");
      setTasks(data);
    } catch {
      /* mantener cache */
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== "tasks") return;
    fetchTasks();
  }, [tab, fetchTasks]);

  // Acciones orden
  async function toggleItem(orderId: string, itemId: string, done: boolean) {
    try {
      await api.put(`/api/kds/item/${itemId}/done`, { station, orderId, done: !done });
      setOrders((prev) => prev.map((o) => {
        if (o.id !== orderId) return o;
        const items = o.items.map((i) => (i.id === itemId ? { ...i, done: !done } : i));
        return { ...o, items, allDone: items.every((i) => i.done) };
      }));
    } catch { /* polling corrige */ }
  }

  async function finalizeOrder(orderId: string) {
    try {
      await api.put(`/api/kds/order/${orderId}/ready`, {});
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch { /* polling corrige */ }
  }

  async function handleTaskPinSubmit(pin: string) {
    if (!taskPinFor) return;
    setTaskPinError("");
    const clientId = `${taskPinFor.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (!navigator.onLine) {
      const queue = readPendingLogs();
      queue.push({ clientId, taskId: taskPinFor.id, pin, notes: null, enqueuedAt: new Date().toISOString() });
      writePendingLogs(queue);
      setPendingCount(queue.length);
      setRecentXp({ task: taskPinFor.title, points: taskPinFor.pointsReward, ts: Date.now() });
      setTaskPinFor(null);
      return;
    }

    try {
      const { data } = await api.post<{ pointsEarned: number }>("/api/tasks/log", {
        taskId: taskPinFor.id, pin, clientId,
      });
      setRecentXp({
        task: taskPinFor.title,
        points: data.pointsEarned ?? taskPinFor.pointsReward,
        ts: Date.now(),
      });
      setTaskPinFor(null);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setTaskPinError(e.response?.data?.error || "PIN inválido");
    }
  }

  async function flushPendingLogs(): Promise<void> {
    const queue = readPendingLogs();
    if (queue.length === 0) return;
    const remaining: PendingTaskLog[] = [];
    for (const log of queue) {
      try {
        await api.post("/api/tasks/log", {
          taskId: log.taskId, pin: log.pin, notes: log.notes, clientId: log.clientId,
        });
      } catch {
        remaining.push(log);
      }
    }
    writePendingLogs(remaining);
    setPendingCount(remaining.length);
  }

  function doLogout() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("deviceToken");
      localStorage.removeItem("deviceId");
      localStorage.removeItem("restaurantId");
      localStorage.removeItem("locationId");
      localStorage.removeItem("locationName");
    }
    onLogout();
  }

  const locationName = typeof window !== "undefined" ? localStorage.getItem("locationName") || "" : "";

  return (
    <div className="relative min-h-screen w-full bg-[#0c0c0e] text-white overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-60 -right-40 w-[700px] h-[700px] rounded-full blur-[120px] opacity-40"
        style={{ background: "radial-gradient(circle, rgba(255,184,77,0.18) 0%, transparent 70%)" }}
      />

      {/* HEADER */}
      <header className="relative z-10 flex items-center justify-between gap-4 px-5 py-4 bg-white/5 backdrop-blur-md border-b border-white/10 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-black tracking-[0.25em] text-white/40">KDS</span>
          <span className="text-base font-black text-white tracking-tight truncate">
            {locationName || "Estación de cocina"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <TabPill active={tab === "orders"} onClick={() => setTab("orders")}>
            <Utensils size={14} /> Pedidos
            {orders.length > 0 && <Counter value={orders.length} />}
          </TabPill>
          <TabPill active={tab === "tasks"} onClick={() => setTab("tasks")}>
            <ListChecks size={14} /> Tareas
            {pendingCount > 0 && <Counter value={pendingCount} tone="warn" />}
          </TabPill>
          <TabPill active={tab === "tcp"} onClick={() => setTab("tcp")}>
            <Radio size={14} /> TCP
            {tcpTickets.length > 0 && <Counter value={tcpTickets.length} />}
          </TabPill>
        </div>

        <div className="flex items-center gap-2">
          <NetIndicator online={online} serverOk={serverOk} />
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            aria-label="Info"
            className="w-11 h-11 min-h-[44px] rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 active:scale-95 transition-transform"
          >
            <Info size={18} />
          </button>
          <button
            type="button"
            onClick={() => setShowLogout(true)}
            aria-label="Cerrar sesión"
            className="w-11 h-11 min-h-[44px] rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 active:scale-95 transition-transform text-red-400"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Sub-header estación */}
      {tab === "orders" && (
        <div className="relative z-10 flex items-center gap-2 px-5 py-3 border-b border-white/5 overflow-x-auto">
          {STATIONS.map((s) => {
            const active = s.value === station;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setStation(s.value)}
                className="px-4 py-2 min-h-[44px] rounded-2xl text-xs font-black tracking-wider uppercase whitespace-nowrap active:scale-95 transition-transform"
                style={{
                  background: active ? s.color : "rgba(255,255,255,0.05)",
                  color:      active ? "#0a0a0c" : "rgba(255,255,255,0.55)",
                  border:     active ? `1px solid ${s.color}` : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      <main className="relative z-10 p-5">
        {tab === "orders" ? (
          <OrdersGrid
            loading={loadingOrders}
            orders={orders}
            now={now}
            onToggleItem={toggleItem}
            onFinalize={finalizeOrder}
          />
        ) : tab === "tasks" ? (
          <TasksList
            loading={loadingTasks}
            tasks={tasks}
            recentXp={recentXp}
            pendingCount={pendingCount}
            onPick={(t) => { setTaskPinError(""); setTaskPinFor(t); }}
            onSync={() => flushPendingLogs()}
          />
        ) : (
          <TcpTicketsView
            tickets={tcpTickets}
            listening={tcpListening}
            onDismiss={(id) => setTcpTickets((curr) => curr.filter((t) => t.id !== id))}
            onClear={() => setTcpTickets([])}
          />
        )}
      </main>

      {taskPinFor && (
        <PinTaskModal
          task={taskPinFor}
          error={taskPinError}
          offline={!online}
          onCancel={() => { setTaskPinFor(null); setTaskPinError(""); }}
          onSubmit={handleTaskPinSubmit}
        />
      )}

      {showInfo && (
        <InfoModal onClose={() => setShowInfo(false)} online={online} serverOk={serverOk} pendingLogs={pendingCount} />
      )}

      {showLogout && (
        <LogoutModal onCancel={() => setShowLogout(false)} onConfirm={doLogout} />
      )}
    </div>
  );
}

// ── Subcomponentes ────────────────────────────────────────────────────────

function TabPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-2xl text-xs font-black tracking-wider active:scale-95 transition-transform"
      style={{
        background: active ? "#ffb84d" : "rgba(255,255,255,0.05)",
        color:      active ? "#0a0a0c" : "rgba(255,255,255,0.85)",
        border:     active ? "1px solid #ffb84d" : "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {children}
    </button>
  );
}

function Counter({ value, tone = "default" }: { value: number; tone?: "default" | "warn" }) {
  return (
    <span
      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-black"
      style={{
        background: tone === "warn" ? "rgba(255,92,51,0.25)" : "rgba(0,0,0,0.20)",
        color:      tone === "warn" ? "#FF8B6E" : "inherit",
      }}
    >
      {value}
    </span>
  );
}

function NetIndicator({ online, serverOk }: { online: boolean; serverOk: boolean }) {
  const ok = online && serverOk;
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-2 rounded-full text-[10px] font-black tracking-widest uppercase"
      style={{
        background: ok ? "rgba(136,214,108,0.12)" : "rgba(255,92,51,0.12)",
        border:     ok ? "1px solid rgba(136,214,108,0.35)" : "1px solid rgba(255,92,51,0.35)",
        color:      ok ? "#88D66C" : "#FF8B6E",
      }}
    >
      {online ? <Wifi size={12} /> : <WifiOff size={12} />}
      {online && !serverOk && <ServerOff size={12} />}
      {ok ? "EN LÍNEA" : online ? "SIN SERVER" : "OFFLINE"}
    </div>
  );
}

function OrdersGrid({
  loading, orders, now, onToggleItem, onFinalize,
}: {
  loading: boolean;
  orders: KdsOrder[];
  now: number;
  onToggleItem: (orderId: string, itemId: string, done: boolean) => void;
  onFinalize: (orderId: string) => void;
}) {
  if (loading) {
    return <p className="text-white/40 text-center py-12 text-sm font-bold">Cargando pedidos…</p>;
  }
  if (orders.length === 0) {
    return <p className="text-white/40 text-center py-16 text-sm font-bold">🎉 Sin pedidos pendientes en esta estación</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} now={now} onToggleItem={onToggleItem} onFinalize={onFinalize} />
      ))}
    </div>
  );
}

function OrderCard({
  order, now, onToggleItem, onFinalize,
}: {
  order: KdsOrder;
  now: number;
  onToggleItem: (orderId: string, itemId: string, done: boolean) => void;
  onFinalize: (orderId: string) => void;
}) {
  const mins = minutesElapsed(order.createdAt, now);
  const u    = urgencyOf(mins);
  const allDone = order.items.length > 0 && order.items.every((i) => i.done);

  return (
    <article
      className="rounded-3xl p-5 flex flex-col gap-3 bg-white/5 border"
      style={{
        borderColor: allDone ? "rgba(136,214,108,0.4)" : "rgba(255,255,255,0.10)",
        boxShadow:   allDone ? "0 0 30px rgba(136,214,108,0.15)" : "0 12px 30px rgba(0,0,0,0.35)",
      }}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.75)" }}>
            {ORDER_TYPE_ICONS[order.orderType]}
          </span>
          <span className="text-[15px] font-black tracking-tight text-white">
            {order.orderNumber || order.id.slice(-6)}
          </span>
        </div>
        <span className="px-2 py-1 rounded-full text-[10px] font-black tracking-widest"
              style={{ background: u.bg, color: u.color }}>
          {u.label} · {mins}m
        </span>
      </header>

      <div className="text-[11px] font-bold text-white/55">
        {order.tableNumber ? `Mesa ${order.tableNumber}` : (order.customerName || "Cliente")}
      </div>

      <ul className="flex flex-col gap-2">
        {order.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onToggleItem(order.id, item.id, item.done)}
              className="w-full flex items-center gap-3 px-3 py-2 min-h-[48px] rounded-xl text-left active:scale-95 transition-transform"
              style={{
                background: item.done ? "rgba(136,214,108,0.10)" : "rgba(255,255,255,0.04)",
                border:     item.done ? "1px solid rgba(136,214,108,0.30)" : "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <span
                className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                style={{
                  background: item.done ? "#88D66C" : "transparent",
                  border:     item.done ? "none" : "1.5px solid rgba(255,255,255,0.30)",
                }}
              >
                {item.done && <Check size={14} className="text-[#0c0c0e]" strokeWidth={3} />}
              </span>
              <span
                className="flex-1 text-sm font-bold"
                style={{
                  color: item.done ? "rgba(255,255,255,0.45)" : "white",
                  textDecoration: item.done ? "line-through" : "none",
                }}
              >
                <span className="text-white/55 mr-1">{item.quantity}×</span>{item.menuItemName}
              </span>
            </button>
            {item.notes && <p className="text-[11px] font-medium text-amber-300 ml-9 mt-0.5">⚠ {item.notes}</p>}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => onFinalize(order.id)}
        className="mt-auto w-full min-h-[64px] py-4 rounded-2xl text-sm font-black tracking-wider uppercase active:scale-95 transition-transform"
        style={{
          background: allDone ? "#88D66C" : "rgba(255,255,255,0.05)",
          color:      allDone ? "#0a0a0c" : "rgba(255,255,255,0.55)",
          border:     allDone ? "none" : "1px dashed rgba(255,255,255,0.15)",
          boxShadow:  allDone ? "0 12px 30px rgba(136,214,108,0.30)" : "none",
        }}
      >
        {allDone ? "Finalizar pedido" : "Marca todos para finalizar"}
      </button>
    </article>
  );
}

function TasksList({
  loading, tasks, recentXp, pendingCount, onPick, onSync,
}: {
  loading: boolean;
  tasks: KdsTask[];
  recentXp: { task: string; points: number; ts: number } | null;
  pendingCount: number;
  onPick: (t: KdsTask) => void;
  onSync: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto">
      {recentXp && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#ffb84d]/10 border border-[#ffb84d]/30">
          <Trophy size={18} className="text-[#ffb84d]" />
          <span className="text-sm font-black text-white">+{recentXp.points} XP · {recentXp.task}</span>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-300">
            <RefreshCcw size={14} /> {pendingCount} tarea(s) en cola offline
          </div>
          <button
            type="button"
            onClick={onSync}
            className="px-3 py-2 min-h-[40px] rounded-xl bg-amber-500/20 text-amber-200 text-xs font-black active:scale-95 transition-transform"
          >
            Sincronizar
          </button>
        </div>
      )}

      <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 px-1">Asignaciones operativas</h2>

      {loading ? (
        <p className="text-white/40 text-sm font-bold py-6">Cargando tareas…</p>
      ) : tasks.length === 0 ? (
        <p className="text-white/40 text-sm font-bold py-6">Sin tareas asignadas a esta sucursal.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {tasks.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onPick(t)}
                className="w-full flex items-center gap-4 p-4 min-h-[64px] rounded-2xl text-left bg-white/5 border border-white/10 active:scale-95 transition-transform"
              >
                <div className="w-12 h-12 rounded-xl bg-[#ffb84d]/15 text-[#ffb84d] border border-[#ffb84d]/30 flex items-center justify-center flex-shrink-0">
                  <ListChecks size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white tracking-tight">{t.title}</p>
                  {t.description && <p className="text-[11px] font-medium text-white/55 truncate">{t.description}</p>}
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest bg-[#ffb84d]/20 text-[#ffb84d]">
                  +{t.pointsReward} XP
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PinTaskModal({
  task, error, offline, onCancel, onSubmit,
}: {
  task: KdsTask;
  error: string;
  offline: boolean;
  onCancel: () => void;
  onSubmit: (pin: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0a0a0c]/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl p-6 bg-white/5 backdrop-blur-md border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <span className="text-[10px] font-black tracking-[0.25em] text-[#ffb84d]">VALIDAR TAREA</span>
            <h3 className="text-xl font-black text-white tracking-tight mt-1">{task.title}</h3>
            {task.description && <p className="text-xs font-medium text-white/55 mt-1">{task.description}</p>}
            <p className="text-xs font-bold text-[#ffb84d] mt-2">+{task.pointsReward} XP al validar</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cerrar"
            className="w-10 h-10 min-h-[40px] rounded-xl flex items-center justify-center bg-white/5 border border-white/10 active:scale-95 transition-transform"
          >
            <X size={16} />
          </button>
        </div>

        {offline && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] font-bold text-amber-300 text-center">
            Sin conexión — el log se enviará automáticamente al volver online.
          </div>
        )}

        <NumpadPIN onSubmit={onSubmit} />

        {error && <p className="mt-3 text-center text-xs font-bold" style={{ color: "#FF5C33" }}>{error}</p>}
      </div>
    </div>
  );
}

function InfoModal({
  onClose, online, serverOk, pendingLogs,
}: { onClose: () => void; online: boolean; serverOk: boolean; pendingLogs: number }) {
  // IP local del dispositivo — útil para que el admin sepa cómo
  // configurar la impresora apuntando a esta tablet o al revés. Detección
  // best-effort vía WebRTC ICE candidates.
  const [localIp, setLocalIp] = useState<string>("—");

  useEffect(() => {
    let cancelled = false;
    getLocalIp().then((ip) => { if (!cancelled && ip) setLocalIp(ip); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0a0a0c]/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl p-6 bg-white/5 backdrop-blur-md border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Info size={20} className="text-[#ffb84d]" />
            <h3 className="text-lg font-black text-white tracking-tight">Diagnóstico</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 active:scale-95 transition-transform"
          >
            <X size={16} />
          </button>
        </div>

        <ul className="flex flex-col gap-2">
          <Row label="Internet">
            <span className="inline-flex items-center gap-1.5 text-xs font-black"
                  style={{ color: online ? "#88D66C" : "#FF5C33" }}>
              {online ? <Wifi size={14} /> : <WifiOff size={14} />}
              {online ? "Online" : "Offline"}
            </span>
          </Row>
          <Row label="Servidor">
            <span className="inline-flex items-center gap-1.5 text-xs font-black"
                  style={{ color: serverOk ? "#88D66C" : "#FF5C33" }}>
              {serverOk ? <Server size={14} /> : <ServerOff size={14} />}
              {serverOk ? "Disponible" : "No responde"}
            </span>
          </Row>
          <Row label="IP local">
            <code className="text-xs font-mono text-white/85" title={localIp}>{localIp}</code>
          </Row>
          <Row label="Tareas en cola">
            <span className="text-xs font-black text-white">{pendingLogs}</span>
          </Row>
        </ul>

        <p className="text-[10px] font-medium text-white/40 mt-4 px-1 leading-relaxed">
          La IP local es la dirección de esta tablet en tu red WiFi. Úsala para
          configurar impresoras o paneles auxiliares dentro del local.
        </p>
      </div>
    </div>
  );
}

// Detección best-effort de IP local del dispositivo via WebRTC.
function getLocalIp(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const RTCPeer = (window as unknown as { RTCPeerConnection?: typeof RTCPeerConnection }).RTCPeerConnection;
      if (!RTCPeer) return resolve(null);
      const pc = new RTCPeer({ iceServers: [] });
      pc.createDataChannel("");
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => {});
      const timer = setTimeout(() => {
        try { pc.close(); } catch { /* noop */ }
        resolve(null);
      }, 1500);
      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        const m = e.candidate.candidate.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
        const ip = m?.[1];
        if (ip && !ip.startsWith("0.")) {
          clearTimeout(timer);
          try { pc.close(); } catch { /* noop */ }
          resolve(ip);
        }
      };
    } catch {
      resolve(null);
    }
  });
}

function LogoutModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0a0a0c]/80 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl p-6 bg-white/5 backdrop-blur-md border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
        <h3 className="text-xl font-black text-white tracking-tight mb-2">Cerrar sesión</h3>
        <p className="text-sm font-medium text-white/55 mb-5">
          Vas a desvincular esta tablet del KDS. Necesitarás iniciar sesión de nuevo como ADMIN para volver a operar.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-[56px] py-3 rounded-2xl bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest text-xs active:scale-95 transition-transform"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-[2] min-h-[56px] py-3 rounded-2xl bg-red-500 text-white font-black uppercase tracking-widest text-xs active:scale-95 transition-transform"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/5">
      <span className="text-[10px] font-black tracking-[0.2em] text-white/40 uppercase">{label}</span>
      {children}
    </li>
  );
}

function playBeep(): void {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx  = new Ctor();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch { /* sin audio */ }
}

// ── TCP Tickets view (KDS-as-printer) ─────────────────────────────────────

function TcpTicketsView({
  tickets, listening, onDismiss, onClear,
}: {
  tickets: TcpTicket[];
  listening: boolean;
  onDismiss: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: listening ? "rgba(136,214,108,0.15)" : "rgba(255,92,51,0.15)",
              color:      listening ? "#88D66C" : "#FF8B6E",
              border:     `1px solid ${listening ? "rgba(136,214,108,0.30)" : "rgba(255,92,51,0.30)"}`,
            }}
          >
            <Radio size={18} />
          </div>
          <div>
            <p className="text-sm font-black text-white tracking-tight">
              {listening ? "Escuchando port 9100" : "Listener inactivo"}
            </p>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
              {tickets.length === 0
                ? "Esperando comandas TCP…"
                : `${tickets.length} ticket${tickets.length !== 1 ? "s" : ""} recibido${tickets.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        {tickets.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-2xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest text-white/85 active:scale-95"
          >
            <Trash2 size={14} /> Limpiar
          </button>
        )}
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-3xl bg-white/5 border border-white/10 p-12 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-white/5 flex items-center justify-center mb-4 text-white/40">
            <Radio size={24} />
          </div>
          <p className="text-sm font-black text-white/85 mb-1">Sin comandas todavía</p>
          <p className="text-xs font-medium text-white/40 max-w-sm mx-auto">
            Configura esta tablet como impresora térmica en el TPV usando la
            IP local que aparece en Diagnóstico (Info) y port 9100. Cada
            comanda enviada llegará aquí en tiempo real.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tickets.map((t) => (
            <TcpTicketCard key={t.id} ticket={t} onDismiss={() => onDismiss(t.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TcpTicketCard({ ticket, onDismiss }: { ticket: TcpTicket; onDismiss: () => void }) {
  const tag = ticket.isReceipt
    ? { label: "RECIBO",  color: "#ffb84d" }
    : ticket.isKitchen
      ? { label: "COMANDA", color: "#88D66C" }
      : { label: "TICKET",  color: "#94a3b8" };
  const time = new Date(ticket.receivedAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div
      className="rounded-3xl bg-white/5 border border-white/10 p-5 flex flex-col gap-3 relative"
      style={{ borderColor: tag.color + "40" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span
            className="inline-block text-[10px] font-black tracking-[0.25em] px-2 py-1 rounded-lg"
            style={{ background: tag.color + "20", color: tag.color }}
          >
            {tag.label}
          </span>
          {ticket.orderNumber && (
            <p className="text-xl font-black text-white tracking-tight mt-2">#{ticket.orderNumber}</p>
          )}
          {ticket.tableLabel && (
            <p className="text-[11px] font-bold text-white/55 mt-1">Mesa {ticket.tableLabel}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 active:scale-95 text-white/55"
          aria-label="Marcar como completado"
        >
          <Check size={16} />
        </button>
      </div>

      <pre className="text-[11px] leading-relaxed font-mono text-white/85 whitespace-pre-wrap break-words bg-black/20 rounded-xl p-3 max-h-[280px] overflow-y-auto scrollbar-hide">
{ticket.lines.join("\n")}
      </pre>

      <div className="flex items-center justify-between text-[10px] font-bold text-white/40 uppercase tracking-widest">
        <span>{time}</span>
        <span title={ticket.from}>{ticket.from}</span>
      </div>
    </div>
  );
}
