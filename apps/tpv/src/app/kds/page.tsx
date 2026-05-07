"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Info, Wifi, WifiOff, Server, ServerOff,
  X, Check, ListChecks, Bike, Utensils, ShoppingBag,
  Trophy, RefreshCcw, AlertTriangle,
} from "lucide-react";
import api from "@/lib/api";
import NumpadPIN from "@/components/NumpadPIN";

// ── Tipos ─────────────────────────────────────────────────────────────────

type StationCode = "KITCHEN" | "BAR" | "FRYER";
type TabKey = "orders" | "tasks";

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

interface DeviceAuthResponse {
  accessToken: string;
  deviceId: string;
  role: string;
  restaurantId: string;
  locationId: string;
}

// ── Constantes ────────────────────────────────────────────────────────────

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
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingLogs(logs: PendingTaskLog[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PENDING_LOGS_KEY, JSON.stringify(logs));
}

// ── Página ────────────────────────────────────────────────────────────────

export default function KDSPage() {
  const router = useRouter();

  // Auth de dispositivo (sin PIN humano)
  const [authReady, setAuthReady]   = useState(false);
  const [authError, setAuthError]   = useState<string>("");
  const [deviceId, setDeviceId]     = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");

  // Modo simulación: si el dispositivo NO está vinculado como KDS,
  // mostramos una preview con datos mock para que el admin del POS pueda
  // ver cómo luce la pantalla de cocina sin tocar backend ni necesitar
  // re-vincular la tablet. La caja principal NO debe operar el KDS real.
  const [simulated, setSimulated] = useState(false);

  // UI principal
  const [tab, setTab]               = useState<TabKey>("orders");
  const [station, setStation]       = useState<StationCode>("KITCHEN");

  // Orders
  const [orders, setOrders]         = useState<KdsOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [now, setNow]               = useState<number>(Date.now());
  const prevIds                     = useRef<string[]>([]);

  // Tasks
  const [tasks, setTasks]           = useState<KdsTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskPinFor, setTaskPinFor] = useState<KdsTask | null>(null);
  const [taskPinError, setTaskPinError] = useState<string>("");
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [recentXp, setRecentXp]     = useState<{ task: string; points: number; ts: number } | null>(null);

  // Network state
  const [online, setOnline]         = useState<boolean>(true);
  const [serverOk, setServerOk]     = useState<boolean>(true);
  const [localIp, setLocalIp]       = useState<string>("—");
  const [showInfo, setShowInfo]     = useState<boolean>(false);

  // ── Boot: device auth + detección de IP local ───────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 0. Si el dispositivo NO está vinculado como KDS, entrar en
      //    modo simulación: UI completa pero con datos demo y sin
      //    llamadas al backend. La caja/mesero usan esto solo como
      //    preview de cómo ve cocina las comandas.
      const role = typeof window !== "undefined" ? localStorage.getItem("deviceRole") : null;
      if (role && role !== "KDS") {
        if (!cancelled) {
          setSimulated(true);
          setAuthReady(true);
          setOrders(buildSimulatedOrders());
          setLoadingOrders(false);
        }
        return;
      }

      // 1. Validar que el dispositivo está vinculado
      const deviceToken = typeof window !== "undefined" ? localStorage.getItem("deviceToken") : null;
      const restId     = typeof window !== "undefined" ? localStorage.getItem("restaurantId")   : null;
      const locId      = typeof window !== "undefined" ? localStorage.getItem("locationId")     : null;

      if (!deviceToken || !restId || !locId) {
        if (!cancelled) {
          setAuthError("Dispositivo no vinculado. Vuelve a /setup como ADMIN.");
        }
        return;
      }

      // 2. Canjear deviceToken por JWT (vigente 30 días). Si el accessToken
      //    de la última sesión sigue válido, lo reusa.
      try {
        const cachedToken = localStorage.getItem("accessToken");
        if (!cachedToken) {
          const { data } = await api.post<DeviceAuthResponse>("/api/devices/auth", { deviceToken });
          localStorage.setItem("accessToken", data.accessToken);
          localStorage.setItem("deviceId",    data.deviceId);
          if (!cancelled) {
            setDeviceId(data.deviceId);
            setLocationId(data.locationId);
          }
        } else {
          if (!cancelled) {
            setDeviceId(localStorage.getItem("deviceId") || "—");
            setLocationId(locId);
          }
        }

        if (!cancelled) setAuthReady(true);
      } catch (err) {
        if (!cancelled) setAuthError("No pudimos autenticar este dispositivo. Revisa la red o re-vincula en /setup.");
      }

      // 3. Intentar capturar IP local (best-effort vía WebRTC).
      try {
        const ip = await getLocalIp();
        if (!cancelled && ip) setLocalIp(ip);
      } catch {
        /* sin IP, no crítico */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Network listeners + sync de logs offline ────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    const onOnline = () => {
      flushPendingLogs().catch(() => {});
    };
    window.addEventListener("online", onOnline);

    setPendingCount(readPendingLogs().length);

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // ── Reloj para urgencias (refresco cada 30s) ────────────────────────────

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // ── Polling de órdenes ──────────────────────────────────────────────────

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
    if (!authReady) return;
    if (simulated) return; // modo demo: no llamar backend KDS
    setLoadingOrders(true);
    fetchOrders();
    const t = setInterval(fetchOrders, 12_000);
    return () => clearInterval(t);
  }, [authReady, simulated, fetchOrders]);

  // ── Polling de tareas ───────────────────────────────────────────────────

  const fetchTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const { data } = await api.get<KdsTask[]>("/api/tasks");
      setTasks(data);
    } catch {
      // mantener cache previa
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (tab !== "tasks") return;
    if (simulated) {
      setTasks(buildSimulatedTasks());
      setLoadingTasks(false);
      return;
    }
    fetchTasks();
  }, [authReady, tab, simulated, fetchTasks]);

  // ── Acciones de orden ───────────────────────────────────────────────────

  async function toggleItem(orderId: string, itemId: string, done: boolean) {
    // En simulación solo actualiza UI local — no toca backend.
    if (simulated) {
      setOrders((prev) => prev.map((o) => {
        if (o.id !== orderId) return o;
        const items = o.items.map((i) => (i.id === itemId ? { ...i, done: !done } : i));
        return { ...o, items, allDone: items.every((i) => i.done) };
      }));
      return;
    }
    try {
      await api.put(`/api/kds/item/${itemId}/done`, { station, orderId, done: !done });
      setOrders((prev) => prev.map((o) => {
        if (o.id !== orderId) return o;
        const items = o.items.map((i) => (i.id === itemId ? { ...i, done: !done } : i));
        return { ...o, items, allDone: items.every((i) => i.done) };
      }));
    } catch {
      /* silencio: el polling lo corrige */
    }
  }

  async function finalizeOrder(orderId: string) {
    // Un solo toque — sin PIN. La velocidad manda en cocina.
    if (simulated) {
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      return;
    }
    try {
      await api.put(`/api/kds/order/${orderId}/ready`, {});
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch {
      /* silencio: si falla, polling devuelve la orden */
    }
  }

  // ── Acciones de tarea (con PIN) ─────────────────────────────────────────

  async function handleTaskPinSubmit(pin: string) {
    if (!taskPinFor) return;
    setTaskPinError("");

    // En simulación NO valida PIN ni llama backend — preview solamente.
    if (simulated) {
      setRecentXp({ task: taskPinFor.title, points: taskPinFor.pointsReward, ts: Date.now() });
      setTaskPinFor(null);
      return;
    }

    const clientId = `${taskPinFor.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (!navigator.onLine) {
      // Encolar el log en localStorage. Se sincroniza con window.online.
      const queue = readPendingLogs();
      queue.push({
        clientId,
        taskId: taskPinFor.id,
        pin,
        notes: null,
        enqueuedAt: new Date().toISOString(),
      });
      writePendingLogs(queue);
      setPendingCount(queue.length);
      setRecentXp({ task: taskPinFor.title, points: taskPinFor.pointsReward, ts: Date.now() });
      setTaskPinFor(null);
      return;
    }

    try {
      const { data } = await api.post<{ pointsEarned: number }>("/api/tasks/log", {
        taskId: taskPinFor.id,
        pin,
        clientId,
      });
      setRecentXp({
        task: taskPinFor.title,
        points: data.pointsEarned ?? taskPinFor.pointsReward,
        ts: Date.now(),
      });
      setTaskPinFor(null);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string; code?: string } } };
      const msg = e.response?.data?.error || "PIN inválido";
      setTaskPinError(msg);
    }
  }

  async function flushPendingLogs(): Promise<void> {
    const queue = readPendingLogs();
    if (queue.length === 0) return;
    const remaining: PendingTaskLog[] = [];
    for (const log of queue) {
      try {
        await api.post("/api/tasks/log", {
          taskId:   log.taskId,
          pin:      log.pin,
          notes:    log.notes,
          clientId: log.clientId,
        });
      } catch {
        remaining.push(log);
      }
    }
    writePendingLogs(remaining);
    setPendingCount(remaining.length);
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (authError) {
    return (
      <FullScreenMessage
        icon={<AlertTriangle size={40} className="text-red-400" />}
        title="No se pudo iniciar el KDS"
        message={authError}
        cta={
          <button
            onClick={() => router.replace("/setup")}
            className="px-5 py-3 min-h-[56px] rounded-2xl bg-[#ffb84d] text-[#0a0a0c] font-black active:scale-95 transition-transform"
          >
            Ir a /setup
          </button>
        }
      />
    );
  }

  if (!authReady) {
    return (
      <FullScreenMessage
        icon={<RefreshCcw size={40} className="text-amber-400 animate-spin" />}
        title="Iniciando estación"
        message="Autenticando dispositivo y cargando configuración…"
      />
    );
  }

  return (
    <div
      className="relative min-h-screen w-full bg-[#0c0c0e] text-white overflow-hidden"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-60 -right-40 w-[700px] h-[700px] rounded-full blur-[120px] opacity-40"
        style={{ background: "radial-gradient(circle, rgba(255,184,77,0.18) 0%, transparent 70%)" }}
      />

      {/* Banner modo simulación */}
      {simulated && (
        <div className="relative z-20 px-5 py-2 bg-amber-500/15 border-b border-amber-500/30 flex items-center gap-3 text-[11px] font-bold text-amber-200">
          <span className="px-2 py-0.5 rounded bg-amber-500 text-[#0a0a0c] text-[10px] font-black tracking-widest">DEMO</span>
          Vista previa simulada — esta tablet está vinculada como <code className="text-white/85">{typeof window !== "undefined" ? localStorage.getItem("deviceRole") || "POS" : "POS"}</code>. Para usar el KDS real, vincula otra tablet como <strong>KDS</strong> en /setup.
          <button
            type="button"
            onClick={() => router.replace("/")}
            className="ml-auto px-3 py-1 rounded-lg bg-white/10 border border-white/15 text-white text-[10px] font-black active:scale-95"
          >
            Volver al POS
          </button>
        </div>
      )}

      {/* HEADER glass */}
      <header className="relative z-10 flex items-center justify-between gap-4 px-5 py-4 bg-white/5 backdrop-blur-md border-b border-white/10 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black tracking-[0.25em] text-white/40">KDS</span>
          <span className="text-base font-black text-white tracking-tight">Estación de cocina</span>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2">
          <TabPill active={tab === "orders"} onClick={() => setTab("orders")}>
            <Utensils size={14} /> Pedidos
            {orders.length > 0 && <Counter value={orders.length} />}
          </TabPill>
          <TabPill active={tab === "tasks"} onClick={() => setTab("tasks")}>
            <ListChecks size={14} /> Tareas
            {pendingCount > 0 && <Counter value={pendingCount} tone="warn" />}
          </TabPill>
        </div>

        {/* Indicadores */}
        <div className="flex items-center gap-2">
          <NetIndicator online={online} serverOk={serverOk} />
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            aria-label="Información de diagnóstico"
            className="w-11 h-11 min-h-[44px] rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 active:scale-95 transition-transform"
          >
            <Info size={18} />
          </button>
        </div>
      </header>

      {/* Sub-header de estación (solo en pedidos) */}
      {tab === "orders" && (
        <div className="relative z-10 flex items-center gap-2 px-5 py-3 border-b border-white/5 overflow-x-auto">
          {STATIONS.map((s) => {
            const active = s.value === station;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setStation(s.value)}
                className={`px-4 py-2 min-h-[44px] rounded-2xl text-xs font-black tracking-wider uppercase whitespace-nowrap active:scale-95 transition-transform ${
                  active ? "text-[#0a0a0c]" : "text-white/55"
                }`}
                style={{
                  background: active ? s.color : "rgba(255,255,255,0.05)",
                  border:     active ? `1px solid ${s.color}` : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      {/* CONTENT */}
      <main className="relative z-10 p-5">
        {tab === "orders" ? (
          <OrdersGrid
            loading={loadingOrders}
            orders={orders}
            now={now}
            onToggleItem={toggleItem}
            onFinalize={finalizeOrder}
          />
        ) : (
          <TasksList
            loading={loadingTasks}
            tasks={tasks}
            recentXp={recentXp}
            pendingCount={pendingCount}
            onPick={(t) => { setTaskPinError(""); setTaskPinFor(t); }}
            onSync={() => flushPendingLogs()}
          />
        )}
      </main>

      {/* MODAL: PIN para tarea */}
      {taskPinFor && (
        <PinTaskModal
          task={taskPinFor}
          error={taskPinError}
          offline={!online}
          onCancel={() => { setTaskPinFor(null); setTaskPinError(""); }}
          onSubmit={handleTaskPinSubmit}
        />
      )}

      {/* MODAL: información del dispositivo */}
      {showInfo && (
        <DeviceInfoModal
          onClose={() => setShowInfo(false)}
          deviceId={deviceId}
          locationId={locationId}
          localIp={localIp}
          online={online}
          serverOk={serverOk}
          pendingLogs={pendingCount}
        />
      )}
    </div>
  );
}

// ── Subcomponentes ────────────────────────────────────────────────────────

function FullScreenMessage({
  icon, title, message, cta,
}: { icon: React.ReactNode; title: string; message: string; cta?: React.ReactNode }) {
  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center bg-[#0c0c0e] text-white p-6 text-center gap-3"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {icon}
      <h1 className="text-2xl font-black tracking-tight">{title}</h1>
      <p className="text-sm font-medium text-white/55 max-w-md">{message}</p>
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}

function TabPill({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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
    return (
      <p className="text-white/40 text-center py-16 text-sm font-bold">
        🎉 Sin pedidos pendientes en esta estación
      </p>
    );
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
      {/* Header tarjeta */}
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center w-8 h-8 rounded-xl"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.75)" }}
          >
            {ORDER_TYPE_ICONS[order.orderType]}
          </span>
          <span className="text-[15px] font-black tracking-tight text-white">
            {order.orderNumber || order.id.slice(-6)}
          </span>
        </div>
        <span
          className="px-2 py-1 rounded-full text-[10px] font-black tracking-widest"
          style={{ background: u.bg, color: u.color }}
        >
          {u.label} · {mins}m
        </span>
      </header>

      {/* Mesa / cliente */}
      <div className="text-[11px] font-bold text-white/55">
        {order.tableNumber ? `Mesa ${order.tableNumber}` : (order.customerName || "Cliente")}
      </div>

      {/* Items */}
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
                <span className="text-white/55 mr-1">{item.quantity}×</span>
                {item.menuItemName}
              </span>
            </button>
            {item.notes && (
              <p className="text-[11px] font-medium text-amber-300 ml-9 mt-0.5">⚠ {item.notes}</p>
            )}
          </li>
        ))}
      </ul>

      {/* Finalizar — un solo toque, sin PIN */}
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
      {/* Banner XP reciente */}
      {recentXp && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#ffb84d]/10 border border-[#ffb84d]/30"
        >
          <Trophy size={18} className="text-[#ffb84d]" />
          <span className="text-sm font-black text-white">
            +{recentXp.points} XP · {recentXp.task}
          </span>
        </div>
      )}

      {/* Banner cola offline */}
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

      <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 px-1">
        Asignaciones operativas
      </h2>

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
                  {t.description && (
                    <p className="text-[11px] font-medium text-white/55 truncate">{t.description}</p>
                  )}
                </div>
                <span
                  className="px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest bg-[#ffb84d]/20 text-[#ffb84d]"
                >
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
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0a0a0c]/80 backdrop-blur-sm"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      <div className="w-full max-w-md rounded-3xl p-6 bg-white/5 backdrop-blur-md border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <span className="text-[10px] font-black tracking-[0.25em] text-[#ffb84d]">VALIDAR TAREA</span>
            <h3 className="text-xl font-black text-white tracking-tight mt-1">{task.title}</h3>
            {task.description && (
              <p className="text-xs font-medium text-white/55 mt-1">{task.description}</p>
            )}
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

        {error && (
          <p
            className="mt-3 text-center text-xs font-bold"
            style={{ color: "#FF5C33" }}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function DeviceInfoModal({
  onClose, deviceId, locationId, localIp, online, serverOk, pendingLogs,
}: {
  onClose: () => void;
  deviceId: string;
  locationId: string;
  localIp: string;
  online: boolean;
  serverOk: boolean;
  pendingLogs: number;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0a0a0c]/80 backdrop-blur-sm"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
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
          <InfoRow label="Internet">
            <span
              className="inline-flex items-center gap-1.5 text-xs font-black"
              style={{ color: online ? "#88D66C" : "#FF5C33" }}
            >
              {online ? <Wifi size={14} /> : <WifiOff size={14} />}
              {online ? "Online" : "Offline"}
            </span>
          </InfoRow>
          <InfoRow label="Servidor">
            <span
              className="inline-flex items-center gap-1.5 text-xs font-black"
              style={{ color: serverOk ? "#88D66C" : "#FF5C33" }}
            >
              {serverOk ? <Server size={14} /> : <ServerOff size={14} />}
              {serverOk ? "Disponible" : "No responde"}
            </span>
          </InfoRow>
          <InfoRow label="IP local">
            <code className="text-xs font-mono text-white/85">{localIp}</code>
          </InfoRow>
          <InfoRow label="Device ID">
            <code className="text-xs font-mono text-white/85 truncate max-w-[180px]" title={deviceId}>
              {deviceId || "—"}
            </code>
          </InfoRow>
          <InfoRow label="Location ID">
            <code className="text-xs font-mono text-white/85 truncate max-w-[180px]" title={locationId}>
              {locationId || "—"}
            </code>
          </InfoRow>
          <InfoRow label="Tareas en cola">
            <span className="text-xs font-black text-white">{pendingLogs}</span>
          </InfoRow>
        </ul>
      </div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/5">
      <span className="text-[10px] font-black tracking-[0.2em] text-white/40 uppercase">{label}</span>
      {children}
    </li>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function buildSimulatedOrders(): KdsOrder[] {
  const now = new Date();
  const ago = (mins: number) => new Date(now.getTime() - mins * 60_000).toISOString();
  return [
    {
      id: "demo-1",
      orderNumber: "DEMO-001",
      orderType: "DINE_IN",
      tableNumber: "5",
      customerName: null,
      createdAt: ago(2),
      items: [
        { id: "i1", menuItemName: "Hamburguesa Doble", quantity: 1, done: false, notes: "Sin cebolla" },
        { id: "i2", menuItemName: "Papas grandes", quantity: 1, done: false },
        { id: "i3", menuItemName: "Refresco Cola", quantity: 2, done: false },
      ],
    },
    {
      id: "demo-2",
      orderNumber: "DEMO-002",
      orderType: "TAKEOUT",
      tableNumber: null,
      customerName: "Juan Pérez",
      createdAt: ago(9),
      items: [
        { id: "i4", menuItemName: "Pizza Margherita", quantity: 1, done: true },
        { id: "i5", menuItemName: "Ensalada César", quantity: 1, done: false },
      ],
    },
    {
      id: "demo-3",
      orderNumber: "DEMO-003",
      orderType: "DELIVERY",
      tableNumber: null,
      customerName: "María López",
      createdAt: ago(17),
      items: [
        { id: "i6", menuItemName: "Pollo Rostizado", quantity: 1, done: false },
        { id: "i7", menuItemName: "Arroz", quantity: 2, done: false, notes: "Extra picante" },
      ],
    },
  ];
}

function buildSimulatedTasks(): KdsTask[] {
  return [
    { id: "t1", title: "Limpieza de freidora", description: "Profunda + cambio de aceite", type: "CLEAN", pointsReward: 50, frequency: "daily" },
    { id: "t2", title: "Prep de insumos AM",   description: "Cortar verduras y porcionar carnes", type: "PREP",  pointsReward: 30, frequency: "daily" },
    { id: "t3", title: "Inventario de barra",  description: "Conteo físico de bebidas",          type: "STOCK", pointsReward: 20, frequency: "weekly" },
    { id: "t4", title: "Sanitización superficies", description: "Mesas + barras",               type: "CLEAN", pointsReward: 15, frequency: "shift" },
  ];
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
  } catch {
    /* sin audio en este browser */
  }
}

// Detección best-effort de IP local del dispositivo. WebRTC expone los
// candidates que típicamente incluyen la IP de la NIC. En navegadores
// recientes con privacy-mode estricto puede devolver hash mDNS.
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
        if (m && !m[1].startsWith("0.")) {
          clearTimeout(timer);
          try { pc.close(); } catch { /* noop */ }
          resolve(m[1]);
        }
      };
    } catch {
      resolve(null);
    }
  });
}
