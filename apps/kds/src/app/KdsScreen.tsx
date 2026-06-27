"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Info, Wifi, WifiOff, Server, ServerOff,
  X, Check, ListChecks, Bike, Utensils, ShoppingBag,
  Trophy, RefreshCcw, LogOut, Radio, Trash2,
  Clock3, UserRound, Settings2, PlugZap, Router,
} from "lucide-react";
import { io, type Socket } from "socket.io-client";
import api, { getApiUrl } from "@/lib/api";
import NumpadPIN from "@/components/NumpadPIN";
import KioskUnlockModal from "@/components/KioskUnlockModal";
import { startTcpListener, stopTcpListener, listenForData } from "@/lib/tcpListener";
import { parseEscPosTickets, type ParsedTicketItem } from "@/lib/escpos-parser";

// ── Tipos ─────────────────────────────────────────────────────────────────

type StationCode = "KITCHEN" | "BAR" | "GRILL" | "FRYER";
type TabKey = "orders" | "tasks" | "tcp";
type TicketSize = "compact" | "normal" | "large";
type ReceiveMode = "socket" | "tcp" | "both";

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
  items: ParsedTicketItem[];
  headerLines: string[];
  isKitchen: boolean;
  isReceipt: boolean;
  orderNumber: string | null;
  tableLabel: string | null;
}

interface KdsOrderItem {
  id: string;
  menuItemName: string;
  name?: string | null;
  menuItem?: { name?: string | null } | null;
  quantity: number;
  done: boolean;
  notes?: string | null;
  station?: string | null;
  seatNumber?: number | null;
  course?: string | null;
  modifiers?: Array<{ id: string; name: string; priceAdd?: number | null }>;
}

interface KdsOrder {
  id: string;
  orderNumber: string;
  orderType: "DINE_IN" | "TAKEOUT" | "DELIVERY";
  tableNumber?: string | null;
  customerName?: string | null;
  createdAt: string;
  notes?: string | null;
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
  { value: "GRILL",   label: "Plancha",  color: "#f59e0b" },
  { value: "FRYER",   label: "Freidora", color: "#f97316" },
];

// Lee la config persistida en LoginScreen — qué estaciones vigila este
// KDS. Vacío / inválido = todas (modo central por defecto).
function readKdsStations(): StationCode[] {
  if (typeof window === "undefined") return STATIONS.map((s) => s.value);
  try {
    const raw = localStorage.getItem("kdsStations");
    if (!raw) return STATIONS.map((s) => s.value);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return STATIONS.map((s) => s.value);
    const valid = parsed.filter((c): c is StationCode =>
      STATIONS.some((s) => s.value === c)
    );
    return valid.length > 0 ? valid : STATIONS.map((s) => s.value);
  } catch {
    return STATIONS.map((s) => s.value);
  }
}

const ORDER_TYPE_ICONS: Record<KdsOrder["orderType"], React.ReactNode> = {
  DINE_IN:  <Utensils size={14} />,
  TAKEOUT:  <ShoppingBag size={14} />,
  DELIVERY: <Bike size={14} />,
};

const PENDING_LOGS_KEY = "kds-pending-task-logs";
const KDS_CONFIG_KEY = "kds-display-config";

interface KdsDisplayConfig {
  ticketSize: TicketSize;
  receiveMode: ReceiveMode;
  delayedMinutes: number;
  urgentMinutes: number;
}

function minutesElapsed(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

function urgencyOf(
  mins: number,
  delayedMinutes: number,
  urgentMinutes: number,
): { color: string; label: string; bg: string } {
  if (mins >= urgentMinutes)  return { color: "#ef4444", label: "URGENTE",  bg: "rgba(239,68,68,0.15)" };
  if (mins >= delayedMinutes) return { color: "#f59e0b", label: "DEMORADO", bg: "rgba(245,158,11,0.12)" };
  return { color: "#22c55e", label: "OK", bg: "rgba(34,197,94,0.10)" };
}

function validMinutes(value: unknown, fallback: number, max = 180): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max
    ? value
    : fallback;
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

function readKdsDisplayConfig(): KdsDisplayConfig {
  const fallback: KdsDisplayConfig = {
    ticketSize: "normal",
    receiveMode: "both",
    delayedMinutes: 8,
    urgentMinutes: 15,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(localStorage.getItem(KDS_CONFIG_KEY) || "{}") as Partial<KdsDisplayConfig>;
    const ticketSize: TicketSize =
      parsed.ticketSize === "compact" || parsed.ticketSize === "normal" || parsed.ticketSize === "large"
        ? parsed.ticketSize
        : fallback.ticketSize;
    const receiveMode: ReceiveMode =
      parsed.receiveMode === "socket" || parsed.receiveMode === "tcp" || parsed.receiveMode === "both"
        ? parsed.receiveMode
        : fallback.receiveMode;
    const delayedMinutes = validMinutes(parsed.delayedMinutes, fallback.delayedMinutes, 179);
    const storedUrgentMinutes = validMinutes(parsed.urgentMinutes, fallback.urgentMinutes);
    const urgentMinutes = storedUrgentMinutes > delayedMinutes
      ? storedUrgentMinutes
      : Math.min(180, delayedMinutes + 1);
    return { ticketSize, receiveMode, delayedMinutes, urgentMinutes };
  } catch {
    return fallback;
  }
}

function writeKdsDisplayConfig(config: KdsDisplayConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KDS_CONFIG_KEY, JSON.stringify(config));
}

export default function KdsScreen() {
  const [tab, setTab]               = useState<TabKey>("orders");
  // Estaciones que esta pantalla vigila (config del LoginScreen).
  // visibleStations es el subset de STATIONS que coincide con kdsStations.
  const [allowedStations] = useState<StationCode[]>(() => readKdsStations());
  const visibleStations = STATIONS.filter((s) => allowedStations.includes(s.value));
  const [station, setStation]       = useState<StationCode>(
    () => allowedStations[0] ?? "KITCHEN",
  );

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
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [showLogout, setShowLogout] = useState<boolean>(false);
  const [displayConfig, setDisplayConfig] = useState<KdsDisplayConfig>(() => readKdsDisplayConfig());
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const socketRef = useRef<Socket | null>(null);

  // Tickets recibidos por TCP (KDS-as-printer). Estado efímero.
  const [tcpTickets, setTcpTickets] = useState<TcpTicket[]>([]);
  const [tcpListening, setTcpListening] = useState<boolean>(false);
  const tcpEnabled = displayConfig.receiveMode === "tcp" || displayConfig.receiveMode === "both";
  const serverEnabled = displayConfig.receiveMode === "socket" || displayConfig.receiveMode === "both";

  const updateDisplayConfig = useCallback((patch: Partial<KdsDisplayConfig>) => {
    setDisplayConfig((current) => {
      const next = { ...current, ...patch };
      writeKdsDisplayConfig(next);
      return next;
    });
  }, []);

  // El botón "atrás" del dispositivo (y la tecla Escape) deben cerrar el
  // modal abierto en vez de no hacer nada o salir de la app. Como los
  // modales son estado de React y no rutas, empujamos una entrada al
  // historial al abrir y la consumimos con popstate.
  const anyOverlayOpen = showConfig || showInfo || showLogout || !!taskPinFor;
  useEffect(() => {
    if (!anyOverlayOpen) return;

    const closeOverlays = () => {
      setShowConfig(false);
      setShowInfo(false);
      setShowLogout(false);
      setTaskPinFor(null);
      setTaskPinError("");
    };

    window.history.pushState({ kdsOverlay: true }, "");

    let poppedByBack = false;
    const onPop = () => { poppedByBack = true; closeOverlays(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeOverlays(); };

    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      // Si se cerró con la X / Escape (no con el botón atrás) seguimos
      // teniendo la entrada extra en el historial: la consumimos para no
      // dejar basura que requiera un segundo "atrás".
      if (!poppedByBack && window.history.state?.kdsOverlay) {
        window.history.back();
      }
    };
  }, [anyOverlayOpen]);

  // Arranca el TCP listener en port 9100 al montar; al desmontar (o
  // logout) lo detiene. listenForData mantiene una sola subscripción
  // viva — `parseEscPos` traduce el binario a líneas legibles y
  // pusheamos el ticket al tope de la lista.
  useEffect(() => {
    if (!tcpEnabled) {
      setTcpListening(false);
      stopTcpListener().catch(() => { /* noop */ });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await startTcpListener(9100);
        if (cancelled) return;
        setTcpListening(true);
        await listenForData((ev) => {
          // Un payload puede traer varias comandas concatenadas — una tarjeta
          // por comanda, en orden de llegada.
          const parsedList = parseEscPosTickets(ev.text);
          if (parsedList.length === 0) return;
          const now = Date.now();
          const newTickets: TcpTicket[] = parsedList.map((parsed, idx) => ({
            id: `tcp-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            receivedAt: now,
            from: ev.from,
            lines: parsed.lines,
            items: parsed.items,
            headerLines: parsed.headerLines,
            isKitchen: parsed.isKitchen,
            isReceipt: parsed.isReceipt,
            orderNumber: parsed.orderNumber,
            tableLabel: parsed.tableLabel,
          }));
          setTcpTickets((curr) => [...newTickets, ...curr].slice(0, 50));
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
      setTcpListening(false);
      stopTcpListener().catch(() => { /* noop */ });
    };
  }, [tcpEnabled]);

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
    if (!serverEnabled) {
      setOrders([]);
      setLoadingOrders(false);
      prevIds.current = [];
      return;
    }
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
  }, [serverEnabled, station]);

  useEffect(() => {
    if (!serverEnabled) {
      setLoadingOrders(false);
      setOrders([]);
      prevIds.current = [];
      return;
    }
    setLoadingOrders(true);
    fetchOrders();
    const t = setInterval(fetchOrders, displayConfig.receiveMode === "socket" ? 30_000 : 12_000);
    return () => clearInterval(t);
  }, [displayConfig.receiveMode, fetchOrders, serverEnabled]);

  useEffect(() => {
    if (!serverEnabled || typeof window === "undefined") {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
      return;
    }

    const token = localStorage.getItem("accessToken") || "";
    const restaurantId = localStorage.getItem("restaurantId") || "";
    const locationId = localStorage.getItem("locationId") || "";
    if (!token || !restaurantId) return;

    const socket = io(getApiUrl(), {
      auth: { token },
      query: { restaurantId },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });

    socketRef.current = socket;
    socket.on("connect", () => {
      setSocketConnected(true);
      socket.emit("join:admin");
      socket.emit("join:kitchen");
      if (locationId) {
        socket.emit("join:location:admin", locationId);
        socket.emit("join:location:kitchen", locationId);
      }
      fetchOrders();
    });
    socket.on("disconnect", () => setSocketConnected(false));
    socket.on("connect_error", () => setSocketConnected(false));
    socket.on("order:new", fetchOrders);
    socket.on("new:order", fetchOrders);
    socket.on("order:updated", fetchOrders);
    socket.on("order:paid", fetchOrders);

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("connect_error");
      socket.off("order:new", fetchOrders);
      socket.off("new:order", fetchOrders);
      socket.off("order:updated", fetchOrders);
      socket.off("order:paid", fetchOrders);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
      setSocketConnected(false);
    };
  }, [fetchOrders, serverEnabled]);

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
          <SourceIndicator
            mode={displayConfig.receiveMode}
            socketConnected={socketConnected}
            tcpListening={tcpListening}
          />
          <NetIndicator online={online} serverOk={serverOk} />
          <button
            type="button"
            onClick={() => setShowConfig(true)}
            aria-label="Configuracion KDS"
            className="w-11 h-11 min-h-[44px] rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 active:scale-95 transition-transform"
          >
            <Settings2 size={18} />
          </button>
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

      {/* Sub-header estación — visible solo cuando hay 2+ estaciones
          configuradas. Si esta pantalla es de una sola estación
          (config del LoginScreen) ocultamos los tabs y mostramos el
          rótulo fijo. */}
      {tab === "orders" && visibleStations.length > 1 && (
        <div className="relative z-10 flex items-center gap-2 px-5 py-3 border-b border-white/5 overflow-x-auto">
          {visibleStations.map((s) => {
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
      {tab === "orders" && visibleStations.length === 1 && (
        <div className="relative z-10 flex items-center gap-3 px-5 py-3 border-b border-white/5">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: visibleStations[0]!.color }}
          />
          <span className="text-xs font-black uppercase tracking-[0.2em] text-white/85">
            {visibleStations[0]!.label}
          </span>
          <span className="text-[10px] font-bold text-white/40">
            · estación dedicada
          </span>
        </div>
      )}

      <main className="relative z-10 p-5">
        {tab === "orders" ? (
          <OrdersGrid
            loading={loadingOrders}
            orders={orders}
            now={now}
            ticketSize={displayConfig.ticketSize}
            receiveMode={displayConfig.receiveMode}
            delayedMinutes={displayConfig.delayedMinutes}
            urgentMinutes={displayConfig.urgentMinutes}
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
            enabled={tcpEnabled}
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

      {showConfig && (
        <ConfigModal
          config={displayConfig}
          socketConnected={socketConnected}
          tcpListening={tcpListening}
          onChange={updateDisplayConfig}
          onClose={() => setShowConfig(false)}
        />
      )}

      {showLogout && (
        <KioskUnlockModal onClose={() => setShowLogout(false)} />
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

function SourceIndicator({
  mode, socketConnected, tcpListening,
}: {
  mode: ReceiveMode;
  socketConnected: boolean;
  tcpListening: boolean;
}) {
  const socketOn = mode === "socket" || mode === "both";
  const tcpOn = mode === "tcp" || mode === "both";
  const ok = (!socketOn || socketConnected) && (!tcpOn || tcpListening);
  const label = mode === "both" ? "SOCKET+TCP" : mode === "socket" ? "SOCKET" : "TCP";
  return (
    <div
      className="hidden md:inline-flex items-center gap-2 px-3 py-2 rounded-full text-[10px] font-black tracking-widest uppercase"
      style={{
        background: ok ? "rgba(255,184,77,0.12)" : "rgba(255,255,255,0.06)",
        border: ok ? "1px solid rgba(255,184,77,0.30)" : "1px solid rgba(255,255,255,0.10)",
        color: ok ? "#ffb84d" : "rgba(255,255,255,0.50)",
      }}
      title={`Recepcion: ${label}`}
    >
      {mode === "tcp" ? <Router size={12} /> : <PlugZap size={12} />}
      {label}
    </div>
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

function ticketGridMin(size: TicketSize): number {
  if (size === "compact") return 210;
  if (size === "large") return 400;
  return 280;
}

function ticketSizeStyles(size: TicketSize): {
  card: string;
  item: string;
  qty: string;
  check: string;
  icon: string;
  meta: string;
  action: string;
  orderNumber: string;
  itemName: string;
} {
  if (size === "compact") {
    return {
      card: "p-3 gap-2.5",
      item: "p-2 min-h-[52px] gap-2",
      qty: "w-10 text-base",
      check: "w-7 h-7 rounded-lg",
      icon: "w-9 h-9 rounded-xl",
      meta: "text-[10px] px-2 py-1",
      action: "min-h-[48px] py-2.5 text-xs rounded-xl",
      orderNumber: "text-lg",
      itemName: "text-[14px]",
    };
  }
  if (size === "large") {
    return {
      card: "p-5 gap-4",
      item: "p-3.5 min-h-[82px] gap-3",
      qty: "w-14 text-2xl",
      check: "w-10 h-10 rounded-xl",
      icon: "w-12 h-12 rounded-2xl",
      meta: "text-xs px-2.5 py-1.5",
      action: "min-h-[60px] py-3.5 text-sm rounded-2xl",
      orderNumber: "text-2xl",
      itemName: "text-[21px]",
    };
  }
  return {
    card: "p-4 gap-3",
    item: "p-2.5 min-h-[64px] gap-2.5",
    qty: "w-12 text-xl",
    check: "w-8 h-8 rounded-lg",
    icon: "w-10 h-10 rounded-xl",
    meta: "text-[11px] px-2 py-1",
    action: "min-h-[52px] py-3 text-xs rounded-xl",
    orderNumber: "text-xl",
    itemName: "text-[17px]",
  };
}

function OrdersGrid({
  loading, orders, now, ticketSize, receiveMode, delayedMinutes, urgentMinutes, onToggleItem, onFinalize,
}: {
  loading: boolean;
  orders: KdsOrder[];
  now: number;
  ticketSize: TicketSize;
  receiveMode: ReceiveMode;
  delayedMinutes: number;
  urgentMinutes: number;
  onToggleItem: (orderId: string, itemId: string, done: boolean) => void;
  onFinalize: (orderId: string) => void;
}) {
  if (receiveMode === "tcp") {
    return (
      <div className="max-w-xl mx-auto rounded-3xl bg-white/5 border border-white/10 p-8 text-center">
        <Router size={28} className="mx-auto text-[#ffb84d] mb-3" />
        <p className="text-lg font-black text-white mb-1">Modo TCP local activo</p>
        <p className="text-sm font-medium text-white/45">
          Las comandas entran por la IP local de esta tablet. Revisalas en la pestana TCP.
        </p>
      </div>
    );
  }
  if (loading) {
    return <p className="text-white/40 text-center py-12 text-sm font-bold">Cargando pedidos…</p>;
  }
  if (orders.length === 0) {
    return <p className="text-white/40 text-center py-16 text-sm font-bold">🎉 Sin pedidos pendientes en esta estación</p>;
  }
  return (
    <div
      className="grid gap-3 items-start"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${ticketGridMin(ticketSize)}px, 1fr))` }}
    >
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          now={now}
          ticketSize={ticketSize}
          delayedMinutes={delayedMinutes}
          urgentMinutes={urgentMinutes}
          onToggleItem={onToggleItem}
          onFinalize={onFinalize}
        />
      ))}
    </div>
  );
}

function OrderCard({
  order, now, ticketSize, delayedMinutes, urgentMinutes, onToggleItem, onFinalize,
}: {
  order: KdsOrder;
  now: number;
  ticketSize: TicketSize;
  delayedMinutes: number;
  urgentMinutes: number;
  onToggleItem: (orderId: string, itemId: string, done: boolean) => void;
  onFinalize: (orderId: string) => void;
}) {
  const mins = minutesElapsed(order.createdAt, now);
  const u    = urgencyOf(mins, delayedMinutes, urgentMinutes);
  const allDone = order.items.length > 0 && order.items.every((i) => i.done);
  // Antepone "Mesa" solo si el valor no lo trae ya (el backend manda table.name,
  // que suele venir como "Mesa 4"), evitando el duplicado "Mesa Mesa 4".
  const mesaLabel = order.tableNumber
    ? (/^mesa\b/i.test(order.tableNumber.trim())
        ? order.tableNumber.trim()
        : `Mesa ${order.tableNumber.trim()}`)
    : "";
  // El cliente solo es "real" si no repite la mesa (ni su etiqueta ni el valor crudo);
  // en DINE_IN sin nombre el customerName puede venir como la propia mesa ("Mesa 4").
  const custName = order.customerName?.trim() ?? "";
  const isRealCustomer =
    !!custName &&
    custName.toLowerCase() !== mesaLabel.toLowerCase() &&
    custName.toLowerCase() !== (order.tableNumber?.trim().toLowerCase() ?? "");
  const orderLabel = mesaLabel
    ? (isRealCustomer ? `${mesaLabel} · ${custName}` : mesaLabel)
    : (custName || "Cliente");
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const size = ticketSizeStyles(ticketSize);

  return (
    <article
      className={`rounded-3xl flex flex-col bg-[#16171a] border ${size.card}`}
      style={{
        borderColor: allDone ? "rgba(136,214,108,0.4)" : `${u.color}80`,
        boxShadow: allDone
          ? "0 0 30px rgba(136,214,108,0.15)"
          : `0 12px 30px rgba(0,0,0,0.35), 0 0 24px ${u.bg}`,
      }}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className={`inline-flex items-center justify-center flex-shrink-0 ${size.icon}`}
                style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.85)" }}>
            {ORDER_TYPE_ICONS[order.orderType]}
          </span>
          <div className="min-w-0">
            <span className="block text-[11px] font-black uppercase tracking-[0.24em] text-white/35">Pedido</span>
            <span className={`block font-black tracking-tight text-white truncate ${size.orderNumber}`}>
              {order.orderNumber || order.id.slice(-6)}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[11px] font-black tracking-widest"
                style={{ background: u.bg, color: u.color }}>
            <Clock3 size={13} /> {u.label} · {mins}m
          </span>
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
            {totalItems} pieza{totalItems === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.07] border border-white/10 text-[12px] font-black text-white/80">
          <UserRound size={13} /> {orderLabel}
        </span>
        {order.notes && (
          <span className="px-3 py-1.5 rounded-full bg-amber-400/12 border border-amber-400/20 text-[11px] font-bold text-amber-200">
            {order.notes}
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-2.5">
        {order.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onToggleItem(order.id, item.id, item.done)}
              className={`w-full flex items-stretch rounded-xl text-left active:scale-[0.99] transition-transform ${size.item}`}
              style={{
                background: item.done ? "rgba(136,214,108,0.11)" : "rgba(255,255,255,0.065)",
                border:     item.done ? "1px solid rgba(136,214,108,0.34)" : "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <span
                className={`${size.check} flex items-center justify-center flex-shrink-0 self-center`}
                style={{
                  background: item.done ? "#88D66C" : "transparent",
                  border:     item.done ? "none" : "2px solid rgba(255,255,255,0.36)",
                }}
              >
                {item.done && <Check size={20} className="text-[#0c0c0e]" strokeWidth={3} />}
              </span>
              <span className={`rounded-xl flex items-center justify-center bg-black/25 border border-white/10 font-black text-[#ffb84d] flex-shrink-0 ${size.qty}`}>
                {item.quantity}x
              </span>
              <span className="flex-1 min-w-0 py-0.5">
                <span
                  className={`block leading-tight font-black tracking-tight break-words ${size.itemName}`}
                  style={{
                    color: item.done ? "rgba(255,255,255,0.48)" : "white",
                    textDecoration: item.done ? "line-through" : "none",
                  }}
                >
                  {displayItemName(item)}
                </span>
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {item.course && <ItemMeta className={size.meta}>{item.course}</ItemMeta>}
                  {item.seatNumber && <ItemMeta className={size.meta}>Comensal {item.seatNumber}</ItemMeta>}
                  {(item.modifiers || []).map((mod) => (
                    <ItemMeta key={mod.id} className={size.meta}>+ {mod.name}</ItemMeta>
                  ))}
                </span>
                {item.notes && (
                  <span className="block mt-2 text-[12px] leading-snug font-bold text-amber-200">
                    {item.notes}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => onFinalize(order.id)}
        className={`mt-auto w-full font-black tracking-wider uppercase active:scale-95 transition-transform ${size.action}`}
        style={{
          background: allDone ? "#88D66C" : "rgba(255,255,255,0.05)",
          color:      allDone ? "#0a0a0c" : "rgba(255,255,255,0.55)",
          border:     allDone ? "none" : "1px dashed rgba(255,255,255,0.15)",
          boxShadow:  allDone ? "0 12px 30px rgba(136,214,108,0.30)" : "none",
        }}
      >
        {allDone ? "Finalizar pedido" : "Marca productos para finalizar"}
      </button>
    </article>
  );
}

function displayItemName(item: KdsOrderItem): string {
  const name = (item.menuItemName || item.name || item.menuItem?.name || "").trim();
  return name && name !== "undefined" ? name : "Producto sin nombre";
}

function ItemMeta({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-lg bg-white/[0.07] border border-white/10 font-black uppercase tracking-[0.12em] text-white/[0.58] ${className}`}>
      {children}
    </span>
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

function ConfigModal({
  config, socketConnected, tcpListening, onChange, onClose,
}: {
  config: KdsDisplayConfig;
  socketConnected: boolean;
  tcpListening: boolean;
  onChange: (patch: Partial<KdsDisplayConfig>) => void;
  onClose: () => void;
}) {
  const sizeOptions: Array<{ value: TicketSize; title: string; body: string }> = [
    { value: "compact", title: "Compacto", body: "Hasta 4 tickets por fila en esta tablet." },
    { value: "normal", title: "Normal", body: "Hasta 3 tickets por fila con lectura comoda." },
    { value: "large", title: "Grande", body: "Hasta 2 tickets por fila para verlos a distancia." },
  ];
  const modeOptions: Array<{ value: ReceiveMode; title: string; body: string; icon: React.ReactNode }> = [
    {
      value: "both",
      title: "Socket + TCP",
      body: "Recibe del servidor y tambien como impresora local.",
      icon: <PlugZap size={18} />,
    },
    {
      value: "socket",
      title: "Socket servidor",
      body: "Comandas en tiempo real desde la nube, con respaldo de refresco.",
      icon: <Wifi size={18} />,
    },
    {
      value: "tcp",
      title: "Solo IP local TCP",
      body: "La tablet escucha por port 9100 dentro de la red del local.",
      icon: <Router size={18} />,
    },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0a0a0c]/80 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-[#16171a] border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[92vh]">
        <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#ffb84d]/15 border border-[#ffb84d]/30 text-[#ffb84d] flex items-center justify-center">
              <Settings2 size={20} />
            </div>
            <div>
              <h3 className="text-xl font-black text-white tracking-tight">Configuracion KDS</h3>
              <p className="text-xs font-bold text-white/40">Tiempos, tamano de ticket y modo de recepcion</p>
            </div>
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

        <div className="p-6 flex flex-col gap-6 overflow-y-auto">
          <section className="flex flex-col gap-3">
            <div>
              <h4 className="text-[11px] font-black uppercase tracking-[0.24em] text-white/45">Colores por tiempo</h4>
              <p className="text-xs font-medium text-white/45 mt-1">
                El ticket inicia verde, cambia a ambar al demorarse y a rojo cuando es urgente.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ConfigTimeInput
                label="Demorado"
                color="#f59e0b"
                value={config.delayedMinutes}
                min={1}
                max={config.urgentMinutes - 1}
                onChange={(delayedMinutes) => onChange({ delayedMinutes })}
              />
              <ConfigTimeInput
                label="Urgente"
                color="#ef4444"
                value={config.urgentMinutes}
                min={config.delayedMinutes + 1}
                max={180}
                onChange={(urgentMinutes) => onChange({ urgentMinutes })}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div>
              <h4 className="text-[11px] font-black uppercase tracking-[0.24em] text-white/45">Tamano del ticket</h4>
              <p className="text-xs font-medium text-white/45 mt-1">
                Ajusta cuanto espacio ocupa cada pedido y que tan grandes se ven los productos.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {sizeOptions.map((option) => (
                <ConfigChoice
                  key={option.value}
                  active={config.ticketSize === option.value}
                  title={option.title}
                  body={option.body}
                  onClick={() => onChange({ ticketSize: option.value })}
                />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h4 className="text-[11px] font-black uppercase tracking-[0.24em] text-white/45">Recepcion de comandas</h4>
                <p className="text-xs font-medium text-white/45 mt-1">
                  Define si la cocina escucha al servidor, a la red local, o a ambos.
                </p>
              </div>
              <div className="flex gap-2 text-[10px] font-black uppercase tracking-widest">
                <StatusDot ok={socketConnected} label="Socket" muted={config.receiveMode === "tcp"} />
                <StatusDot ok={tcpListening} label="TCP" muted={config.receiveMode === "socket"} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {modeOptions.map((option) => (
                <ConfigChoice
                  key={option.value}
                  active={config.receiveMode === option.value}
                  title={option.title}
                  body={option.body}
                  icon={option.icon}
                  onClick={() => onChange({ receiveMode: option.value })}
                />
              ))}
            </div>
          </section>

          <div className="rounded-2xl bg-black/20 border border-white/10 p-4 text-xs leading-relaxed text-white/55">
            Socket beneficia cuando quieres actualizacion inmediata desde el servidor y varias pantallas sincronizadas.
            TCP local beneficia cuando el TPV debe imprimir directo a esta tablet dentro de la misma red, incluso si quieres evitar depender del canal de socket.
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigTimeInput({
  label, color, value, min, max, onChange,
}: {
  label: string;
  color: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const setClamped = (next: number) => {
    if (!Number.isFinite(next)) return;
    onChange(Math.max(min, Math.min(max, Math.round(next))));
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="inline-flex items-center gap-2 text-sm font-black text-white">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          {label}
        </span>
        <span className="text-[10px] font-black uppercase tracking-widest text-white/35">minutos</span>
      </div>
      <div className="grid grid-cols-[48px_1fr_48px] gap-2">
        <button
          type="button"
          onClick={() => setClamped(value - 1)}
          disabled={value <= min}
          className="h-12 rounded-xl bg-white/5 border border-white/10 text-xl font-black text-white disabled:opacity-25 active:scale-95"
        >
          -
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(event) => setClamped(Number(event.target.value))}
          className="h-12 min-w-0 rounded-xl bg-black/20 border border-white/10 text-center text-xl font-black text-white outline-none focus:border-[#ffb84d]/60"
          aria-label={`${label} en minutos`}
        />
        <button
          type="button"
          onClick={() => setClamped(value + 1)}
          disabled={value >= max}
          className="h-12 rounded-xl bg-white/5 border border-white/10 text-xl font-black text-white disabled:opacity-25 active:scale-95"
        >
          +
        </button>
      </div>
    </div>
  );
}

function ConfigChoice({
  active, title, body, icon, onClick,
}: {
  active: boolean;
  title: string;
  body: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[112px] rounded-2xl border p-4 text-left active:scale-[0.98] transition-transform"
      style={{
        background: active ? "rgba(255,184,77,0.12)" : "rgba(255,255,255,0.045)",
        borderColor: active ? "rgba(255,184,77,0.70)" : "rgba(255,255,255,0.10)",
      }}
    >
      <span className="flex items-center gap-2 text-sm font-black text-white">
        {icon && <span className={active ? "text-[#ffb84d]" : "text-white/45"}>{icon}</span>}
        {title}
      </span>
      <span className="block text-[11px] leading-snug font-medium text-white/45 mt-2">{body}</span>
    </button>
  );
}

function StatusDot({ ok, label, muted }: { ok: boolean; label: string; muted: boolean }) {
  return (
    <span className={muted ? "text-white/25" : ok ? "text-[#88D66C]" : "text-[#FF8B6E]"}>
      {label}: {muted ? "off" : ok ? "on" : "off"}
    </span>
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
  tickets, listening, enabled, onDismiss, onClear,
}: {
  tickets: TcpTicket[];
  listening: boolean;
  enabled: boolean;
  onDismiss: (id: string) => void;
  onClear: () => void;
}) {
  if (!enabled) {
    return (
      <div className="rounded-3xl bg-white/5 border border-white/10 p-12 text-center">
        <Router size={28} className="mx-auto text-white/40 mb-4" />
        <p className="text-sm font-black text-white/85 mb-1">TCP local desactivado</p>
        <p className="text-xs font-medium text-white/40 max-w-sm mx-auto">
          Activalo en Configuracion si quieres que el TPV envie comandas a la IP local de esta tablet por el puerto 9100.
        </p>
      </div>
    );
  }
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
  const time = new Date(ticket.receivedAt).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", second: "2-digit" });

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

      {ticket.headerLines.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold text-white/45 uppercase tracking-wide">
          {ticket.headerLines.map((line, idx) => (
            <span key={idx}>{line}</span>
          ))}
        </div>
      )}

      {ticket.items.length > 0 ? (
        <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto scrollbar-hide">
          {ticket.items.map((item, idx) => {
            const prevGroup = idx > 0 ? ticket.items[idx - 1]?.group : undefined;
            const showGroup = item.group && item.group !== prevGroup;
            return (
              <div key={idx} className="flex flex-col gap-1">
                {showGroup && (
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45 mt-1">
                    {item.group}
                  </p>
                )}
                <div className="flex items-start gap-3 rounded-xl bg-black/20 px-3 py-2">
                  <span
                    className="shrink-0 text-base font-black tabular-nums"
                    style={{ color: tag.color }}
                  >
                    {item.quantity}×
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-black text-white leading-tight break-words">
                      {item.name}
                    </p>
                    {item.modifiers.map((mod, mIdx) => (
                      <p key={mIdx} className="text-[12px] font-semibold text-white/65 leading-tight">
                        + {mod}
                      </p>
                    ))}
                    {item.notes.map((note, nIdx) => (
                      <p key={nIdx} className="text-[12px] font-bold text-[#ffb84d] leading-tight">
                        {note}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <pre className="text-[11px] leading-relaxed font-mono text-white/85 whitespace-pre-wrap break-words bg-black/20 rounded-xl p-3 max-h-[280px] overflow-y-auto scrollbar-hide">
{ticket.lines.join("\n")}
        </pre>
      )}

      <div className="flex items-center justify-between text-[10px] font-bold text-white/40 uppercase tracking-widest">
        <span>{time}</span>
        <span title={ticket.from}>{ticket.from}</span>
      </div>
    </div>
  );
}
