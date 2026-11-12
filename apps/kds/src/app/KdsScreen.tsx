"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  Info, Wifi, WifiOff, Server, ServerOff,
  X, Check, ListChecks, Bike, Utensils, ShoppingBag,
  Trophy, RefreshCcw, Radio, Trash2,
  Clock3, UserRound, Settings2, PlugZap, Router, Store, ChevronLeft, ChevronRight, ChevronsDown,
  BarChart3, PackageCheck, MessageSquare, Send,
} from "lucide-react";
import { io, type Socket } from "socket.io-client";
import api, { getApiUrl } from "@/lib/api";
import NumpadPIN from "@/components/NumpadPIN";
import OrderHistory from "@/components/OrderHistory";
import { startTcpListener, stopTcpListener, listenForData } from "@/lib/tcpListener";
import { parseEscPosTickets } from "@/lib/escpos-parser";
import { readLocalTickets, writeLocalTickets, type LocalKitchenTicket as TcpTicket } from "@/lib/local-tickets";
import { boardColumns, boardRange } from "@/lib/kitchen-board";
import { buildProductionSummary, type SummaryItem } from "@/lib/production-summary";
import {
  buildStationOrdersView,
  mergeServerAndTcpOrders,
  normalizeOrderNumber,
  readLanFirstState,
  writeLanFirstState,
  type LanFirstState,
  type OfflineKdsMutation,
} from "@/lib/lan-first";

// ── Tipos ─────────────────────────────────────────────────────────────────

type StationCode = "KITCHEN" | "BAR" | "GRILL" | "FRYER";
type TabKey = "orders" | "summary" | "packing" | "history" | "tasks" | "tcp";
type TicketSize = "compact" | "normal" | "large";
type ReceiveMode = "socket" | "tcp" | "both";

interface KdsOrderItem {
  id: string;
  menuItemId: string;
  comboName?: string;
  routingFallback?: boolean;
  menuItemName: string;
  name?: string | null;
  menuItem?: { name?: string | null } | null;
  quantity: number;
  done: boolean;
  notes?: string | null;
  station?: string | null;
  areaLabel?: string | null;
  syncStations?: StationCode[];
  seatNumber?: number | null;
  course?: string | null;
  modifiers?: Array<{ id: string; name: string; priceAdd?: number | null }>;
  comboSelections?: Array<{ optionMenuItemId?: string; name?: string }>;
}

interface KdsOrder {
  id: string;
  orderNumber: string;
  orderType: "DINE_IN" | "TAKEOUT" | "DELIVERY";
  tableNumber?: string | null;
  customerName?: string | null;
  /** Canal del pedido (TPV, ONLINE, WHATSAPP, MARKETPLACE…). */
  source?: string | null;
  createdAt: string;
  sentToKitchenAt?: string;
  notes?: string | null;
  items: KdsOrderItem[];
  allDone?: boolean;
  preparationComplete?: boolean;
  stationStates?: Array<{ station: StationCode; done: boolean }>;
  isLocalTcp?: boolean;
  tcpTicketId?: string;
}

interface PackingCheck {
  key: string;
  checked: boolean;
}

interface PackingOrderItem {
  id: string;
  name: string;
  quantity: number;
  notes?: string | null;
}

interface PackingOrder {
  id: string;
  orderNumber: string;
  orderType: "DINE_IN" | "TAKEOUT" | "DELIVERY";
  customerName?: string | null;
  deliveryAddress?: string | null;
  paymentStatus?: string | null;
  createdAt?: string;
  items: PackingOrderItem[];
  checks: PackingCheck[];
}

interface KdsMessageItem {
  id: string;
  orderId: string;
  station: string;
  message: string;
  read: boolean;
  createdAt: string;
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

const PACKING_CHECK_LABELS: Record<string, string> = {
  DRINKS_COMPLETE: "Bebidas completas",
  SAUCES_PACKED: "Salsas aparte",
  TICKET_PRINTED: "Ticket impreso",
  ADDRESS_CONFIRMED: "Dirección confirmada",
  PAYMENT_CONFIRMED: "Pago confirmado",
};

const QUICK_MESSAGES = [
  "Falta ingrediente para preparar",
  "Tiempo extra de cocción (+10 min)",
  "Duda en nota del pedido · favor de confirmar",
  "Pedido listo en barra para recoger",
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

export default function KdsScreen({ onChangeStore }: { onChangeStore: () => void }) {
  const [tab, setTab]               = useState<TabKey>("orders");
  // Estaciones que esta pantalla vigila (config del LoginScreen).
  // visibleStations es el subset de STATIONS que coincide con kdsStations.
  const [allowedStations] = useState<StationCode[]>(() => readKdsStations());
  const visibleStations = STATIONS.filter((s) => allowedStations.includes(s.value));
  const [station, setStation]       = useState<StationCode>(
    () => allowedStations[0] ?? "KITCHEN",
  );

  const [stationMap, setStationMap] = useState<Partial<Record<StationCode, KdsOrder[]>>>({});
  const orders = useMemo(() => buildStationOrdersView(stationMap, station), [stationMap, station]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [now, setNow]               = useState<number>(Date.now());
  const prevIds                     = useRef<string[]>([]);
  const fetchSequence = useRef(0);
  const currentStation = useRef(station);
  currentStation.current = station;
  const busyOrders = useRef(new Set<string>());
  const [pendingOrders, setPendingOrders] = useState<string[]>([]);
  const [actionError, setActionError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  // Empaque (PACKING)
  const [packingOrders, setPackingOrders] = useState<PackingOrder[]>([]);
  const [loadingPacking, setLoadingPacking] = useState(false);
  const busyPackingOrders = useRef(new Set<string>());
  const [pendingPackingOrders, setPendingPackingOrders] = useState<string[]>([]);
  const packingSequence = useRef(0);

  // Mensajes de cocina (KdsMessage)
  const [unreadMessages, setUnreadMessages] = useState<KdsMessageItem[]>([]);
  const [messageModalOrder, setMessageModalOrder] = useState<KdsOrder | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);

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
  const [displayConfig, setDisplayConfig] = useState<KdsDisplayConfig>(() => readKdsDisplayConfig());
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const socketRef = useRef<Socket | null>(null);

  // Bandeja local durable: archivar no cambia el pedido del servidor.
  const [tcpTickets, setTcpTickets] = useState<TcpTicket[]>([]);
  const [tcpRestored, setTcpRestored] = useState(false);
  const [tcpStorageError, setTcpStorageError] = useState("");
  const tcpStorageBlocked = useRef(false);
  const [showTcpHistory, setShowTcpHistory] = useState(false);
  const [tcpListening, setTcpListening] = useState<boolean>(false);
  const tcpEnabled = displayConfig.receiveMode === "tcp" || displayConfig.receiveMode === "both";
  const serverEnabled = displayConfig.receiveMode === "socket" || displayConfig.receiveMode === "both";

  // Estado LAN-First (optimistic UI 0ms + cola de mutaciones offline + deduplicación TCP/Cloud)
  const [lanState, setLanState] = useState<LanFirstState>(() =>
    typeof window !== "undefined" ? readLanFirstState(localStorage) : {
      itemOverrides: {},
      orderNumItemOverrides: {},
      finalizedOrderIds: [],
      finalizedOrderNumbers: [],
      mutationQueue: [],
    },
  );
  const flushingLanRef = useRef(false);

  const updateLanState = useCallback((updater: (prev: LanFirstState) => LanFirstState) => {
    setLanState((prev) => {
      const next = updater(prev);
      if (typeof window !== "undefined") {
        writeLanFirstState(localStorage, next);
      }
      return next;
    });
  }, []);

  const boardOrders = useMemo(
    () => mergeServerAndTcpOrders(orders, tcpTickets, station, lanState, tcpEnabled),
    [orders, tcpTickets, station, lanState, tcpEnabled],
  );

  const productionSummary = useMemo(() => buildProductionSummary(boardOrders), [boardOrders]);
  const totalSummaryPending = useMemo(
    () => productionSummary.reduce((sum, item) => sum + item.qtyPending, 0),
    [productionSummary],
  );

  useEffect(() => {
    try { setTcpTickets(readLocalTickets(localStorage)); }
    catch {
      tcpStorageBlocked.current = true;
      setTcpStorageError("No se pudo recuperar el respaldo local. Se conservó sin sobrescribirlo; las nuevas comandas estarán solo en memoria hasta revisar esta tablet.");
    }
    setTcpRestored(true);
  }, []);

  useEffect(() => {
    if (!tcpRestored || tcpStorageBlocked.current) return;
    try { writeLocalTickets(localStorage, tcpTickets); setTcpStorageError(""); }
    catch { setTcpStorageError("Las comandas locales están solo en memoria: no hay espacio para respaldarlas. No reinicies esta tablet."); }
  }, [tcpRestored, tcpTickets]);

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
  const anyOverlayOpen = showConfig || showInfo || !!taskPinFor || !!messageModalOrder;
  useEffect(() => {
    if (!anyOverlayOpen) return;

    const closeOverlays = () => {
      setShowConfig(false);
      setShowInfo(false);
      setTaskPinFor(null);
      setTaskPinError("");
      setMessageModalOrder(null);
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
  // agregamos la comanda al final para no mover el trabajo que ya se está leyendo.
  useEffect(() => {
    if (!tcpRestored) return;
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
          if (newTickets.some((t) => !t.isReceipt && t.items.length > 0)) {
            playBeep();
          }
          setTcpTickets((curr) => [...curr, ...newTickets]);
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
  }, [tcpEnabled, tcpRestored]);

  const flushLanMutations = useCallback(async () => {
    if (flushingLanRef.current || typeof window === "undefined" || !navigator.onLine) return;
    const current = readLanFirstState(localStorage);
    if (current.mutationQueue.length === 0) return;

    flushingLanRef.current = true;
    const remaining: OfflineKdsMutation[] = [];
    try {
      for (const mut of current.mutationQueue) {
        try {
          if (mut.type === "ITEM_DONE") {
            await api.put(`/api/kds/item/${encodeURIComponent(mut.itemId)}/done`, {
              station: mut.station,
              orderId: mut.orderId,
              done: mut.done,
            });
          } else if (mut.type === "ORDER_READY") {
            await api.put(`/api/kds/order/${mut.orderId}/ready`, {});
          }
        } catch (err: unknown) {
          const status = (err as { response?: { status?: number } })?.response?.status;
          // Si es error de red o 5xx, conservar en cola para reintentar luego.
          // Si es 404/409 (el pedido ya avanzó en servidor), descartar de la cola.
          if (!status || status >= 500) {
            remaining.push(mut);
          }
        }
      }
      updateLanState((prev) => ({ ...prev, mutationQueue: remaining }));
    } finally {
      flushingLanRef.current = false;
    }
  }, [updateLanState]);

  // Network listeners
  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    const onOnline = () => {
      flushPendingLogs().catch(() => {});
      flushLanMutations().catch(() => {});
    };
    window.addEventListener("online", onOnline);
    setPendingCount(readPendingLogs().length);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("online", onOnline);
    };
  }, [flushLanMutations]);

  // Reloj urgencias
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const fetchPackingOrders = useCallback(async () => {
    if (!serverEnabled) {
      setPackingOrders([]);
      setLoadingPacking(false);
      return;
    }
    const sequence = ++packingSequence.current;
    try {
      const { data } = await api.get<PackingOrder[]>("/api/kds/packing/orders");
      if (sequence !== packingSequence.current) return;
      setPackingOrders(Array.isArray(data) ? data : []);
    } catch {
      /* conservar último estado de empaque */
    } finally {
      if (sequence === packingSequence.current) setLoadingPacking(false);
    }
  }, [serverEnabled]);

  const fetchUnreadMessages = useCallback(async () => {
    if (!serverEnabled) {
      setUnreadMessages([]);
      return;
    }
    try {
      const { data } = await api.get<KdsMessageItem[]>("/api/kds/messages/unread");
      if (Array.isArray(data)) setUnreadMessages(data);
    } catch {
      /* opcional: algunos tests o mocks pueden no exponer este endpoint */
    }
  }, [serverEnabled]);

  // Polling órdenes
  const fetchOrders = useCallback(async () => {
    if (!serverEnabled) {
      setStationMap({});
      setLoadingOrders(false);
      prevIds.current = [];
      return;
    }
    void flushLanMutations();
    const sequence = ++fetchSequence.current;
    try {
      const safeGet = (st: StationCode) =>
        api.get<KdsOrder[]>(`/api/kds/orders/${st}`).then((r) => (Array.isArray(r.data) ? r.data : []));

      const [kitchenData, fryerData] = await Promise.all([
        safeGet("KITCHEN"),
        safeGet("FRYER").catch(() => [] as KdsOrder[]),
      ]);

      const nextMap: Partial<Record<StationCode, KdsOrder[]>> = {
        KITCHEN: kitchenData,
        FRYER: fryerData,
      };

      if (currentStation.current === "BAR") {
        nextMap.BAR = await safeGet("BAR").catch(() => [] as KdsOrder[]);
      }

      if (sequence !== fetchSequence.current) return;
      setServerOk(true);
      setLastUpdatedAt(Date.now());

      const unifiedData = buildStationOrdersView(nextMap, "KITCHEN");
      const newIds = unifiedData.map((o) => o.id);
      if (prevIds.current.length > 0 && newIds.some((id) => !prevIds.current.includes(id))) {
        playBeep();
      }
      prevIds.current = newIds;
      setStationMap((prev) => ({ ...prev, ...nextMap }));

      // Limpiar overrides de ítems que ya coinciden con el servidor y no tienen mutaciones pendientes
      updateLanState((prev) => {
        if (prev.mutationQueue.length > 0) return prev;
        const activeIds = new Set(unifiedData.map((o) => o.id));
        const activeNums = new Set(unifiedData.map((o) => normalizeOrderNumber(o.orderNumber)).filter(Boolean));
        const nextItemOverrides = { ...prev.itemOverrides };
        for (const order of unifiedData) {
          for (const item of order.items) {
            const directKey = `${order.id}::${item.id}`;
            const stationKey = `${order.id}::${item.station || "KITCHEN"}::${item.id}`;
            if (nextItemOverrides[directKey] === item.done) delete nextItemOverrides[directKey];
            if (nextItemOverrides[stationKey] === item.done) delete nextItemOverrides[stationKey];
          }
        }
        return {
          ...prev,
          itemOverrides: nextItemOverrides,
          // Conservar finalizedOrderIds solo mientras el pedido siga apareciendo en el poll activo
          finalizedOrderIds: prev.finalizedOrderIds.filter((id) => activeIds.has(id) || id.startsWith("tcp-order:")),
          finalizedOrderNumbers: prev.finalizedOrderNumbers.filter((num) => activeNums.has(num)),
        };
      });
    } catch {
      if (sequence === fetchSequence.current) setServerOk(false);
    } finally {
      if (sequence === fetchSequence.current) setLoadingOrders(false);
    }
  }, [flushLanMutations, serverEnabled, updateLanState]);

  const refreshAllKdsData = useCallback(() => {
    void fetchOrders();
    void fetchPackingOrders();
    void fetchUnreadMessages();
  }, [fetchOrders, fetchPackingOrders, fetchUnreadMessages]);

  useEffect(() => {
    if (!serverEnabled) {
      setLoadingOrders(false);
      setStationMap({});
      setPackingOrders([]);
      setUnreadMessages([]);
      prevIds.current = [];
      return;
    }
    fetchOrders();
    fetchPackingOrders();
    fetchUnreadMessages();
    const t = setInterval(() => {
      fetchOrders();
      fetchPackingOrders();
      fetchUnreadMessages();
    }, displayConfig.receiveMode === "socket" ? 30_000 : 12_000);
    return () => {
      ++fetchSequence.current;
      ++packingSequence.current;
      clearInterval(t);
    };
  }, [displayConfig.receiveMode, fetchOrders, fetchPackingOrders, fetchUnreadMessages, serverEnabled]);

  useEffect(() => {
    if (tab === "packing" && serverEnabled) {
      setLoadingPacking(true);
      void fetchPackingOrders();
    }
  }, [tab, serverEnabled, fetchPackingOrders]);

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
      refreshAllKdsData();
    });
    socket.on("disconnect", () => setSocketConnected(false));
    socket.on("connect_error", () => setSocketConnected(false));
    socket.on("order:new", refreshAllKdsData);
    socket.on("new:order", refreshAllKdsData);
    socket.on("order:updated", refreshAllKdsData);
    socket.on("order:paid", refreshAllKdsData);
    socket.on("kds:updated", refreshAllKdsData);

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("connect_error");
      socket.off("order:new", refreshAllKdsData);
      socket.off("new:order", refreshAllKdsData);
      socket.off("order:updated", refreshAllKdsData);
      socket.off("order:paid", refreshAllKdsData);
      socket.off("kds:updated", refreshAllKdsData);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
      setSocketConnected(false);
    };
  }, [refreshAllKdsData, serverEnabled]);

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

  // Acciones orden (LAN-First: respuesta optimista en 0ms + sincronización/cola en segundo plano)
  async function toggleItem(orderId: string, itemId: string, done: boolean) {
    const nextDone = !done;
    const targetOrder = boardOrders.find((o) => o.id === orderId);
    const targetItem = targetOrder?.items.find((i) => i.id === itemId);
    const targetStations: StationCode[] = targetItem?.syncStations?.length
      ? targetItem.syncStations
      : [(targetItem?.station as StationCode) || station];

    const normNum = normalizeOrderNumber(targetOrder?.orderNumber);
    const itemIndex = targetOrder ? targetOrder.items.findIndex((i) => i.id === itemId) : -1;
    const directKey = `${orderId}::${itemId}`;
    const numKey = normNum && itemIndex >= 0 ? `${normNum}::${itemIndex}` : "";

    setActionError("");
    updateLanState((prev) => {
      const nextOverrides: Record<string, boolean> = {
        ...prev.itemOverrides,
        [directKey]: nextDone,
        [`${orderId}::${station}::${itemId}`]: nextDone,
      };
      for (const st of targetStations) {
        nextOverrides[`${orderId}::${st}::${itemId}`] = nextDone;
      }
      return {
        ...prev,
        itemOverrides: nextOverrides,
        orderNumItemOverrides: numKey
          ? { ...prev.orderNumItemOverrides, [numKey]: nextDone }
          : prev.orderNumItemOverrides,
      };
    });

    // Si es una comanda recibida por TCP que aún no tiene ID de servidor,
    // el estado queda persistido en local y se transfiere por #orderNumber.
    if (targetOrder?.isLocalTcp || orderId.startsWith("tcp-order:")) {
      return;
    }

    const enqueueStationMutations = () => {
      const nowTs = Date.now();
      const newMutations: OfflineKdsMutation[] = targetStations.map((st, idx) => ({
        id: `mut-${nowTs}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        type: "ITEM_DONE",
        orderId,
        orderNumber: targetOrder?.orderNumber,
        station: st,
        itemId,
        done: nextDone,
        createdAt: nowTs,
      }));
      updateLanState((prev) => ({
        ...prev,
        mutationQueue: [...prev.mutationQueue, ...newMutations],
      }));
    };

    if (!navigator.onLine) {
      enqueueStationMutations();
      return;
    }

    ++fetchSequence.current;
    try {
      await Promise.all(
        targetStations.map((st) =>
          api.put(`/api/kds/item/${encodeURIComponent(itemId)}/done`, {
            station: st,
            orderId,
            done: nextDone,
          }),
        ),
      );
      await fetchOrders();
      void fetchPackingOrders();
    } catch (error: unknown) {
      const response = error as { response?: { status?: number; data?: { error?: string } } };
      const status = response.response?.status;
      if (!status || status >= 500) {
        enqueueStationMutations();
      } else {
        updateLanState((prev) => {
          const nextOverrides = { ...prev.itemOverrides };
          delete nextOverrides[directKey];
          delete nextOverrides[`${orderId}::${station}::${itemId}`];
          for (const st of targetStations) {
            delete nextOverrides[`${orderId}::${st}::${itemId}`];
          }
          return { ...prev, itemOverrides: nextOverrides };
        });
        setActionError(response.response?.data?.error || "No se guardó la confirmación. Comprueba la conexión y vuelve a intentar.");
        await fetchOrders();
      }
    }
  }

  async function finalizeOrder(orderId: string) {
    if (busyOrders.current.has(orderId)) return;
    const targetOrder = boardOrders.find((o) => o.id === orderId);
    if (!targetOrder || !isOrderReadyToFinalize(targetOrder)) return;

    const normNum = normalizeOrderNumber(targetOrder.orderNumber);
    setActionError("");

    // Ocultar en 0ms del tablero principal y archivar ticket TCP equivalente si existe
    updateLanState((prev) => ({
      ...prev,
      finalizedOrderIds: prev.finalizedOrderIds.includes(orderId)
        ? prev.finalizedOrderIds
        : [...prev.finalizedOrderIds, orderId],
      finalizedOrderNumbers:
        normNum && !prev.finalizedOrderNumbers.includes(normNum)
          ? [...prev.finalizedOrderNumbers, normNum]
          : prev.finalizedOrderNumbers,
    }));

    if (targetOrder.tcpTicketId || normNum) {
      setTcpTickets((curr) =>
        curr.map((t) =>
          t.id === targetOrder.tcpTicketId || (normNum && normalizeOrderNumber(t.orderNumber) === normNum)
            ? { ...t, archivedAt: t.archivedAt || Date.now() }
            : t,
        ),
      );
    }

    if (targetOrder.isLocalTcp || orderId.startsWith("tcp-order:")) {
      return;
    }

    if (!navigator.onLine) {
      updateLanState((prev) => ({
        ...prev,
        mutationQueue: [
          ...prev.mutationQueue,
          {
            id: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: "ORDER_READY",
            orderId,
            orderNumber: targetOrder.orderNumber,
            createdAt: Date.now(),
          },
        ],
      }));
      return;
    }

    busyOrders.current.add(orderId);
    setPendingOrders([...busyOrders.current]);
    ++fetchSequence.current;
    try {
      await api.put(`/api/kds/order/${orderId}/ready`, {});
      await fetchOrders();
      void fetchPackingOrders();
    } catch (error: unknown) {
      const response = error as { response?: { status?: number; data?: { error?: string } } };
      const status = response.response?.status;
      if (!status || status >= 500) {
        updateLanState((prev) => ({
          ...prev,
          mutationQueue: [
            ...prev.mutationQueue,
            {
              id: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: "ORDER_READY",
              orderId,
              orderNumber: targetOrder.orderNumber,
              createdAt: Date.now(),
            },
          ],
        }));
      } else {
        updateLanState((prev) => ({
          ...prev,
          finalizedOrderIds: prev.finalizedOrderIds.filter((id) => id !== orderId),
          finalizedOrderNumbers: prev.finalizedOrderNumbers.filter((n) => n !== normNum),
        }));
        setActionError(response.response?.data?.error || "No se pudo confirmar la preparación del pedido.");
        await fetchOrders();
      }
    } finally {
      busyOrders.current.delete(orderId);
      setPendingOrders([...busyOrders.current]);
    }
  }

  async function togglePackingCheck(orderId: string, checkKey: string, checked: boolean) {
    if (busyPackingOrders.current.has(orderId)) return;
    busyPackingOrders.current.add(orderId);
    setPendingPackingOrders([...busyPackingOrders.current]);
    setActionError("");
    ++packingSequence.current;
    try {
      await api.put(`/api/kds/packing/${orderId}/check`, { checkKey, checked });
      await fetchPackingOrders();
    } catch (error: unknown) {
      const response = error as { response?: { data?: { error?: string } } };
      setActionError(response.response?.data?.error || "No se guardó la verificación de empaque. Vuelve a intentar.");
      await fetchPackingOrders();
    } finally {
      busyPackingOrders.current.delete(orderId);
      setPendingPackingOrders([...busyPackingOrders.current]);
    }
  }

  async function handleSendOrderMessage(orderId: string, message: string) {
    const trimmed = message.trim();
    if (!trimmed || sendingMessage) return;
    setSendingMessage(true);
    setActionError("");
    try {
      await api.post("/api/kds/message", { orderId, station, message: trimmed });
      setMessageModalOrder(null);
      await fetchUnreadMessages();
    } catch (error: unknown) {
      const response = error as { response?: { data?: { error?: string } } };
      setActionError(response.response?.data?.error || "No se pudo enviar el aviso del pedido.");
    } finally {
      setSendingMessage(false);
    }
  }

  async function handleMarkMessageRead(messageId: string) {
    try {
      await api.put(`/api/kds/messages/${encodeURIComponent(messageId)}/read`, {});
      setUnreadMessages((curr) => curr.filter((m) => m.id !== messageId));
    } catch {
      /* ignorar fallo transitorio */
    }
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
  const restaurantName = typeof window !== "undefined" ? localStorage.getItem("restaurantName")?.trim() || "" : "";
  const changeStore = () => {
    if (busyOrders.current.size || busyPackingOrders.current.size || readPendingLogs().length) {
      setActionError("Espera a que terminen las acciones pendientes y sincroniza las tareas desde Tareas antes de cambiar de tienda.");
      return;
    }
    if (tcpStorageBlocked.current || tcpStorageError) {
      setActionError("No se puede cambiar de tienda mientras haya un problema con el respaldo de las comandas locales. Revisa el aviso antes de continuar.");
      return;
    }
    onChangeStore();
  };

  const stationSelectorNode = (
    <nav aria-label="Estaciones de cocina" className="flex items-center gap-1 overflow-x-auto">
      {visibleStations.map((s) => (
        <button
          key={s.value}
          type="button"
          aria-pressed={s.value === station}
          onClick={() => setStation(s.value)}
          className="px-3 min-h-[38px] rounded-xl text-xs font-bold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-white"
          style={{
            background: s.value === station ? s.color : "rgba(255,255,255,0.05)",
            color: s.value === station ? "#0a0a0c" : "rgba(255,255,255,0.8)",
          }}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="relative h-[100dvh] w-full flex flex-col bg-[#0c0c0e] text-white overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-60 -right-40 w-[700px] h-[700px] rounded-full blur-[120px] opacity-40"
        style={{ background: "radial-gradient(circle, rgba(255,184,77,0.18) 0%, transparent 70%)" }}
      />

      {/* HEADER EN 1 SOLA LÍNEA COMPACTA */}
      <header className="relative z-10 shrink-0 flex items-center justify-between gap-2 px-2.5 py-1.5 bg-white/5 border-b border-white/10">
        <button type="button" onClick={changeStore} aria-label="Cambiar tienda o sucursal"
          title={`${restaurantName} · ${locationName}`}
          className="shrink-0 flex min-h-[38px] items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-2.5 py-1 text-left focus-visible:outline-2 focus-visible:outline-amber-300">
          <Store size={16} className="shrink-0 text-[#ffb84d]" />
          <span className="min-w-0 leading-tight"><span className="block max-w-36 truncate text-xs font-bold">{restaurantName || locationName || "Estación de cocina"}</span>
            <span className="block max-w-36 truncate text-[10px] font-semibold text-[#ffb84d]">{restaurantName && `${locationName} · `}Cambiar</span></span>
        </button>

        <nav aria-label="Vistas del KDS" className="flex-1 min-w-0 flex items-center justify-center gap-1 overflow-x-auto">
          <TabPill active={tab === "orders"} onClick={() => setTab("orders")}>
            <Utensils size={13} /> En cocina
            {boardOrders.length > 0 && <Counter value={boardOrders.length} />}
          </TabPill>
          <TabPill active={tab === "summary"} onClick={() => setTab("summary")}>
            <BarChart3 size={13} /> Consolidado
            {totalSummaryPending > 0 && <Counter value={totalSummaryPending} />}
          </TabPill>
          <TabPill active={tab === "packing"} onClick={() => setTab("packing")}>
            <PackageCheck size={13} /> Empaque
            {packingOrders.length > 0 && <Counter value={packingOrders.length} tone="warn" />}
          </TabPill>
          <TabPill active={tab === "history"} onClick={() => setTab("history")}>
            <Clock3 size={13} /> Historial
          </TabPill>
          <TabPill active={tab === "tasks"} onClick={() => setTab("tasks")}>
            <ListChecks size={13} /> Tareas
            {pendingCount > 0 && <Counter value={pendingCount} tone="warn" />}
          </TabPill>
          <TabPill active={tab === "tcp"} onClick={() => setTab("tcp")}>
            <Radio size={13} /> Red local
            {tcpTickets.some((ticket) => !ticket.archivedAt) && <Counter value={tcpTickets.filter((ticket) => !ticket.archivedAt).length} />}
          </TabPill>
        </nav>

        <div className="shrink-0 flex items-center gap-1.5">
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
            className="w-9 h-9 min-h-[38px] rounded-xl flex items-center justify-center bg-white/5 border border-white/10 active:scale-95 transition-transform"
          >
            <Settings2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            aria-label="Info"
            className="w-9 h-9 min-h-[38px] rounded-xl flex items-center justify-center bg-white/5 border border-white/10 active:scale-95 transition-transform"
          >
            <Info size={16} />
          </button>
        </div>
      </header>

      <main className={`relative z-10 flex-1 min-h-0 flex flex-col gap-1.5 px-2.5 py-2 ${tab === "orders" ? "overflow-hidden" : "overflow-y-auto"}`}>
        {actionError && <p role="alert" className="shrink-0 rounded-xl bg-red-500/15 p-2 text-sm text-red-200">{actionError}</p>}
        {tcpStorageError && <p role="alert" className="shrink-0 rounded-xl bg-amber-400/15 p-2 text-sm text-amber-200">{tcpStorageError}</p>}
        {unreadMessages[0] && (
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquare size={15} className="shrink-0 text-[#ffb84d]" />
              <span className="font-bold text-amber-100 truncate">
                [{STATIONS.find((s) => s.value === unreadMessages[0]?.station)?.label || unreadMessages[0]?.station}] {unreadMessages[0]?.message}
              </span>
              {unreadMessages.length > 1 && (
                <span className="shrink-0 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-black text-[#ffb84d]">
                  +{unreadMessages.length - 1} más
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                const msg = unreadMessages[0];
                if (msg) void handleMarkMessageRead(msg.id);
              }}
              className="shrink-0 rounded-lg bg-[#ffb84d] px-2.5 py-1 text-[11px] font-black text-[#0a0a0c] active:scale-95"
            >
              Enterado
            </button>
          </div>
        )}
        {tab === "orders" ? (
          <OrdersGrid
            key={station}
            stationControls={stationSelectorNode}
            syncStatus={serverEnabled ? <p role="status" className={`text-xs ${serverOk ? "text-white/75" : "text-red-200"}`}>
            {lastUpdatedAt ? `Actualizado ${new Date(lastUpdatedAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}` : "Conectando con el servidor…"}
            {!serverOk && " · Modo local-first activo"}
            {lanState.mutationQueue.length > 0 && ` · ${lanState.mutationQueue.length} cambio(s) en cola local`}
          </p> : <p role="status" className="text-xs text-[#ffb84d]">Modo Red Local TCP 9100 activo</p>}
            loading={loadingOrders && boardOrders.length === 0}
            orders={boardOrders}
            now={now}
            ticketSize={displayConfig.ticketSize}
            receiveMode={displayConfig.receiveMode}
            delayedMinutes={displayConfig.delayedMinutes}
            urgentMinutes={displayConfig.urgentMinutes}
            onToggleItem={toggleItem}
            onFinalize={finalizeOrder}
            onMessageOrder={(order) => setMessageModalOrder(order)}
            pendingOrders={pendingOrders}
            onHistory={() => setTab("history")}
          />
        ) : tab === "summary" ? (
          <ProductionSummaryView
            station={station}
            stationControls={stationSelectorNode}
            loading={loadingOrders}
            summary={productionSummary}
            totalPending={totalSummaryPending}
            onBackToOrders={() => setTab("orders")}
          />
        ) : tab === "packing" ? (
          <PackingOrdersView
            orders={packingOrders}
            loading={loadingPacking}
            pendingOrders={pendingPackingOrders}
            onToggleCheck={togglePackingCheck}
            onRefresh={() => void fetchPackingOrders()}
          />
        ) : tab === "history" ? <OrderHistory /> : tab === "tasks" ? (
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
            tickets={tcpTickets.filter((ticket) => showTcpHistory ? !!ticket.archivedAt : !ticket.archivedAt)}
            listening={tcpListening}
            enabled={tcpEnabled}
            history={showTcpHistory}
            onToggleHistory={() => setShowTcpHistory((current) => !current)}
            onDismiss={(id) => setTcpTickets((curr) => curr.map((ticket) => ticket.id === id
              ? { ...ticket, archivedAt: ticket.archivedAt ? undefined : Date.now() } : ticket))}
            onClear={() => setTcpTickets((curr) => curr.map((ticket) => ticket.archivedAt ? ticket : { ...ticket, archivedAt: Date.now() }))}
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

      {messageModalOrder && (
        <OrderMessageModal
          order={messageModalOrder}
          stationLabel={STATIONS.find((s) => s.value === station)?.label || station}
          sending={sendingMessage}
          onCancel={() => setMessageModalOrder(null)}
          onSubmit={(msg) => void handleSendOrderMessage(messageModalOrder.id, msg)}
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

    </div>
  );
}

// ── Subcomponentes ────────────────────────────────────────────────────────

function TabPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[38px] rounded-xl text-xs font-bold focus-visible:outline-2 focus-visible:outline-amber-300 active:scale-95 transition-transform"
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
  const label = mode === "both" ? "Servidor + red local" : mode === "socket" ? "Servidor" : "Red local";
  return (
    <div
      className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase"
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
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase"
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
      card: "p-2 gap-1.5",
      item: "px-2 py-1.5 min-h-[36px] gap-2",
      qty: "text-sm",
      check: "w-5 h-5 rounded-md",
      icon: "w-6 h-6 rounded-lg",
      meta: "text-[10px] px-1.5 py-0.5",
      action: "min-h-[38px] py-1.5 text-xs rounded-xl",
      orderNumber: "text-lg",
      itemName: "text-[14px]",
    };
  }
  if (size === "large") {
    return {
      card: "p-2.5 gap-2",
      item: "px-2.5 py-2 min-h-[48px] gap-2",
      qty: "text-lg",
      check: "w-7 h-7 rounded-lg",
      icon: "w-8 h-8 rounded-xl",
      meta: "text-xs px-2 py-0.5",
      action: "min-h-[44px] py-2 text-sm rounded-xl",
      orderNumber: "text-2xl",
      itemName: "text-[18px]",
    };
  }
  return {
    card: "p-2.5 gap-1.5",
    item: "px-2.5 py-1.5 min-h-[40px] gap-2",
    qty: "text-base",
    check: "w-6 h-6 rounded-md",
    icon: "w-6 h-6 rounded-lg",
    meta: "text-[10px] px-1.5 py-0.5",
    action: "min-h-[40px] py-1.5 text-xs rounded-xl",
    orderNumber: "text-xl",
    itemName: "text-[15px]",
  };
}

function OrdersGrid({
  loading, orders, now, ticketSize, receiveMode, delayedMinutes, urgentMinutes, onToggleItem, onFinalize, onMessageOrder, pendingOrders, onHistory, stationControls, syncStatus,
}: {
  stationControls: React.ReactNode;
  syncStatus: React.ReactNode;
  loading: boolean;
  orders: KdsOrder[];
  now: number;
  ticketSize: TicketSize;
  receiveMode: ReceiveMode;
  delayedMinutes: number;
  urgentMinutes: number;
  onToggleItem: (orderId: string, itemId: string, done: boolean) => void;
  onFinalize: (orderId: string) => void;
  onMessageOrder: (order: KdsOrder) => void;
  pendingOrders: string[];
  onHistory: () => void;
}) {
  const boardRef = useRef<HTMLElement>(null);
  const [columns, setColumns] = useState(3);
  const [anchor, setAnchor] = useState<{ id: string; index: number } | null>(null);
  useEffect(() => {
    const element = boardRef.current;
    if (!element) return;
    const measure = () => setColumns(boardColumns(element.clientWidth, ticketSize));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ticketSize]);
  // Si hay 1 o 2 pedidos activos, expandir a 2 columnas anchas para aprovechar la pantalla
  const displayColumns = orders.length > 0 && orders.length <= 2 ? Math.min(columns, 2) : columns;
  const range = boardRange(orders.map(order => order.id), anchor, displayColumns);
  const goTo = (index: number) => {
    const order = orders[index];
    if (order) setAnchor({ id: order.id, index });
  };
  return <section ref={boardRef} aria-label="Cola de cocina" className="flex flex-1 min-h-0 flex-col gap-1.5">
    <div className="shrink-0 flex flex-wrap items-center justify-between gap-2">
      {stationControls}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {!!orders.length && !loading && <p role="status" className="text-xs font-semibold text-white/85">Pedidos <span className="font-bold text-white">{range.start + 1}–{range.end}</span> de {orders.length}</p>}
          {syncStatus}
        </div>
        {!!orders.length && !loading && orders.length > displayColumns && <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Pedidos anteriores" disabled={range.start === 0} onClick={() => goTo(Math.max(0, range.start - displayColumns))}
            className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-white/20 px-2.5 text-xs font-bold disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-amber-300"><ChevronLeft size={16} /> Anteriores</button>
          <button type="button" aria-label="Pedidos siguientes" disabled={range.end >= orders.length} onClick={() => goTo(range.end)}
            className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-white/20 px-2.5 text-xs font-bold disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-amber-300">Siguientes <ChevronRight size={16} /></button>
        </div>}
      </div>
    </div>
    {receiveMode === "tcp" && !orders.length ? <div className="m-auto max-w-xl rounded-2xl border border-white/15 bg-white/5 p-6 text-center">
      <Router size={28} className="mx-auto mb-3 text-[#ffb84d]" />
      <p className="text-lg font-bold">Recepción por red local (TCP 9100)</p>
      <p className="mt-2 text-sm text-white/80">En cuanto llegue una comanda por red local aparecerá automáticamente en esta pantalla y en la pestaña Red local.</p>
    </div> : loading ? <p role="status" className="m-auto text-sm text-white/80">Cargando pedidos…</p>
    : !orders.length ? <div className="m-auto max-w-xl rounded-2xl border border-white/15 bg-white/5 p-6 text-center">
      <p className="text-lg font-bold">Sin trabajo pendiente en esta estación</p>
      <p className="mt-2 text-sm text-white/80">Los pedidos por aceptar, listos, entregados y cancelados se pueden consultar en el historial.</p>
      <button type="button" onClick={onHistory} className="mt-4 min-h-[44px] rounded-xl bg-[#ffb84d] px-5 font-bold text-black">Ver historial</button>
    </div> : <>
      <div className="grid flex-1 min-h-0 gap-2.5" style={{ gridTemplateColumns: `repeat(${displayColumns}, minmax(0, 1fr))` }}>
        {orders.slice(range.start, range.end).map(order => <OrderCard key={order.id} order={order} now={now} ticketSize={ticketSize}
          delayedMinutes={delayedMinutes} urgentMinutes={urgentMinutes} onToggleItem={onToggleItem}
          onFinalize={onFinalize} onMessage={() => onMessageOrder(order)} pending={pendingOrders.includes(order.id)} />)}
      </div>
    </>}
  </section>;
}

function isOrderReadyToFinalize(order: KdsOrder): boolean {
  const allItemsDone = order.items.length > 0 && order.items.every((i) => i.done);
  return typeof order.preparationComplete === "boolean" ? order.preparationComplete : allItemsDone;
}

const ORDER_TYPE_LABELS: Record<KdsOrder["orderType"], string> = {
  DINE_IN: "Salón",
  TAKEOUT: "Para llevar",
  DELIVERY: "Domicilio",
};

const STATION_SECTION_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  Plancha: { color: "#FFB84D", bg: "rgba(255,184,77,0.12)", border: "rgba(255,184,77,0.32)" },
  Freidora: { color: "#88D66C", bg: "rgba(136,214,108,0.12)", border: "rgba(136,214,108,0.32)" },
  Barra: { color: "#6CD6FF", bg: "rgba(108,214,255,0.12)", border: "rgba(108,214,255,0.32)" },
};

function OrderCard({
  order, now, ticketSize, delayedMinutes, urgentMinutes, onToggleItem, onFinalize, onMessage, pending,
}: {
  order: KdsOrder;
  now: number;
  ticketSize: TicketSize;
  delayedMinutes: number;
  urgentMinutes: number;
  onToggleItem: (orderId: string, itemId: string, done: boolean) => void;
  onFinalize: (orderId: string) => void;
  onMessage: () => void;
  pending: boolean;
}) {
  const mins = minutesElapsed(order.sentToKitchenAt || order.createdAt, now);
  const u    = urgencyOf(mins, delayedMinutes, urgentMinutes);
  const allDone = order.items.length > 0 && order.items.every((i) => i.done);
  const canFinalize = isOrderReadyToFinalize(order);
  const doneCount = order.items.filter((item) => item.done).length;
  const mesaLabel = order.tableNumber
    ? (/^mesa\b/i.test(order.tableNumber.trim())
        ? order.tableNumber.trim()
        : `Mesa ${order.tableNumber.trim()}`)
    : "";
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
  const itemsRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  useEffect(() => {
    const element = itemsRef.current;
    if (!element) return;
    const check = () => setHasOverflow(element.scrollHeight > element.clientHeight + 2);
    const observer = new ResizeObserver(check);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    check();
    return () => observer.disconnect();
  }, [order.id, order.items.length, ticketSize]);

  // Agrupar ítems por estación cuando se visualiza desde Cocina General
  const hasAreaLabels = order.items.some((i) => Boolean(i.areaLabel));
  const itemGroups = useMemo(() => {
    if (!hasAreaLabels) {
      return [{ label: "", items: order.items }];
    }
    const orderPriority = ["Plancha", "Freidora", "Barra"];
    const buckets = new Map<string, KdsOrderItem[]>();
    for (const item of order.items) {
      const key = item.areaLabel || "Cocina";
      const list = buckets.get(key) || [];
      list.push(item);
      buckets.set(key, list);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => {
        const idxA = orderPriority.indexOf(a);
        const idxB = orderPriority.indexOf(b);
        return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
      })
      .map(([label, items]) => ({ label, items }));
  }, [hasAreaLabels, order.items]);

  const renderItemRow = (item: KdsOrderItem) => (
    <li key={item.id}>
      <button
        type="button"
        onClick={() => onToggleItem(order.id, item.id, item.done)}
        disabled={pending}
        aria-pressed={item.done}
        aria-label={`${item.quantity} × ${displayItemName(item)} · ${item.done ? "marcado" : "pendiente"}`}
        className={`w-full flex items-center justify-between rounded-xl text-left focus-visible:outline-2 focus-visible:outline-amber-300 active:scale-[0.99] transition-colors ${size.item}`}
        style={{
          background: item.done ? "rgba(136,214,108,0.11)" : "rgba(255,255,255,0.055)",
          border: "2px solid",
          borderColor: item.done ? "rgba(136,214,108,0.40)" : "rgba(255,255,255,0.09)",
        }}
      >
        <span className="flex-1 min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span
              className={`leading-snug font-black tracking-tight break-words ${size.itemName}`}
              style={{
                color: item.done ? "rgba(255,255,255,0.65)" : "white",
                textDecoration: item.done ? "line-through" : "none",
              }}
            >
              <span className={`mr-1 font-black text-[#ffb84d] ${size.qty}`}>{item.quantity}×</span>{displayItemName(item)}
            </span>
            {(item.comboName || item.routingFallback || item.course || item.seatNumber || !!item.modifiers?.length) && (
              <span className="inline-flex flex-wrap items-center gap-1">
                {item.comboName && <ItemMeta className={size.meta}>Combo: {item.comboName}</ItemMeta>}
                {item.routingFallback && <ItemMeta className={size.meta}>Sin ruta</ItemMeta>}
                {item.course && <ItemMeta className={size.meta}>{item.course}</ItemMeta>}
                {item.seatNumber && <ItemMeta className={size.meta}>Comensal {item.seatNumber}</ItemMeta>}
                {(item.modifiers || []).map((mod) => (
                  <ItemMeta key={mod.id} className={size.meta}>+ {mod.name}</ItemMeta>
                ))}
              </span>
            )}
          </span>
          {item.notes && (
            <span className="block mt-0.5 text-[12px] leading-tight font-semibold text-amber-200">
              {item.notes}
            </span>
          )}
        </span>
        <span
          className={`${size.check} flex items-center justify-center flex-shrink-0`}
          style={{
            background: item.done ? "#88D66C" : "transparent",
            border: "2px solid",
            borderColor: item.done ? "#88D66C" : "rgba(255,255,255,0.45)",
          }}
        >
          {item.done && <Check size={15} className="text-[#0c0c0e]" strokeWidth={3} />}
        </span>
      </button>
    </li>
  );

  return (
    <article
      aria-label={`Pedido ${order.orderNumber}`}
      className={`h-full min-h-0 overflow-hidden rounded-2xl flex flex-col bg-[#16171a] border ${size.card}`}
      style={{
        borderColor: allDone ? "rgba(136,214,108,0.45)" : `${u.color}80`,
        boxShadow: allDone
          ? "0 0 24px rgba(136,214,108,0.15)"
          : `0 10px 24px rgba(0,0,0,0.35), 0 0 20px ${u.bg}`,
      }}
    >
      {/* ENCABEZADO COMPACTO EN 1 SOLA FRANJA */}
      <header className="shrink-0 flex items-center justify-between gap-2 pb-1 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={`font-black tracking-tight text-white shrink-0 ${size.orderNumber}`}>
            #{order.orderNumber || order.id.slice(-6)}
          </span>
          <span
            className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold"
            style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.9)" }}
          >
            {ORDER_TYPE_ICONS[order.orderType]}
            <span>{mesaLabel || ORDER_TYPE_LABELS[order.orderType]}</span>
          </span>
          {order.isLocalTcp && (
            <span className="shrink-0 rounded-md border border-[#ffb84d]/40 bg-[#ffb84d]/15 px-1.5 py-0.5 text-[10px] font-black tracking-wider text-[#ffb84d]">
              LAN
            </span>
          )}
          <span title={orderLabel} className="min-w-0 flex-1 inline-flex items-center gap-1 text-xs font-semibold text-white/80 truncate">
            <UserRound size={12} className="shrink-0 text-white/60" />
            <span className="truncate">{orderLabel}</span>
          </span>
          <span className="shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] font-bold text-[#ffb84d]">
            {totalItems} pzas.
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!order.isLocalTcp && (
            <button
              type="button"
              onClick={onMessage}
              aria-label={`Enviar aviso del pedido ${order.orderNumber}`}
              title="Enviar aviso a caja"
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 border border-white/10 text-white/75 hover:text-[#ffb84d] active:scale-95"
            >
              <MessageSquare size={13} />
            </button>
          )}
          <span className="inline-flex items-center gap-1 px-2 h-7 rounded-lg text-[11px] font-bold"
                style={{ background: u.bg, color: u.color }}>
            <Clock3 size={12} /> {u.label} · {mins}m
          </span>
        </div>
      </header>

      <div ref={itemsRef} role="region" aria-label={`Productos del pedido ${order.orderNumber}`} tabIndex={0}
        className="kds-ticket-items flex-1 min-h-0 overflow-y-auto focus-visible:outline-2 focus-visible:outline-amber-300">
        <div className="space-y-1.5 pr-0.5">
          {(order.source?.toUpperCase() === "MARKETPLACE" || order.notes) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {order.source?.toUpperCase() === "MARKETPLACE" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-400/12 border border-amber-400/25 text-[11px] font-bold text-amber-200">
                  <Store size={12} /> Mercadito
                </span>
              )}
              {order.notes && (
                <span className="px-2 py-0.5 rounded-lg bg-amber-400/12 border border-amber-400/20 text-[11px] leading-snug font-semibold text-amber-200">
                  {order.notes}
                </span>
              )}
            </div>
          )}

          {itemGroups.map((group) => {
            const stStyle = STATION_SECTION_STYLES[group.label] || {
              color: "#FFB84D",
              bg: "rgba(255,184,77,0.10)",
              border: "rgba(255,184,77,0.28)",
            };
            const groupDone = group.items.filter((i) => i.done).length;
            return (
              <div key={group.label || "default"} className="space-y-1">
                {group.label && (
                  <div
                    className="flex items-center justify-between px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider"
                    style={{
                      background: stStyle.bg,
                      border: `1px solid ${stStyle.border}`,
                      color: stStyle.color,
                    }}
                  >
                    <span>{group.label}</span>
                    <span className="text-[10px] font-bold opacity-90">
                      {groupDone}/{group.items.length} listos
                    </span>
                  </div>
                )}
                <ul className="flex flex-col gap-1.5">
                  {group.items.map(renderItemRow)}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {!!order.stationStates?.length && (
        <p className="shrink-0 text-[11px] text-white/80">
          {order.stationStates.map((state) => `${STATIONS.find((s) => s.value === state.station)?.label || state.station}: ${state.done ? "lista" : "pendiente"}`).join(" · ")}
        </p>
      )}

      <footer className="shrink-0 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onFinalize(order.id)}
          disabled={pending || !canFinalize}
          aria-busy={pending}
          className={`flex-1 font-bold focus-visible:outline-2 focus-visible:outline-amber-300 active:scale-95 transition-transform ${size.action}`}
          style={{
            background: allDone ? "#88D66C" : "rgba(255,255,255,0.05)",
            color:      allDone ? "#0a0a0c" : "rgba(255,255,255,0.70)",
            border:     allDone ? "2px solid #88D66C" : "2px dashed rgba(255,255,255,0.16)",
            boxShadow:  allDone ? "0 8px 20px rgba(136,214,108,0.28)" : "none",
          }}
        >
          {pending
            ? "Guardando…"
            : canFinalize
              ? `✓ Confirmar preparación (${doneCount}/${order.items.length})`
              : allDone
                ? "Estación lista · esperando otras áreas"
                : `${doneCount}/${order.items.length} marcados · Toca los productos al terminar`}
        </button>
        {hasOverflow && (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-400/15 text-[11px] font-bold text-[#ffcf83]">
            <ChevronsDown size={13} /> Más
          </span>
        )}
      </footer>
    </article>
  );
}

function ProductionSummaryView({
  station,
  stationControls,
  loading,
  summary,
  totalPending,
  onBackToOrders,
}: {
  station: StationCode;
  stationControls: React.ReactNode;
  loading: boolean;
  summary: SummaryItem[];
  totalPending: number;
  onBackToOrders: () => void;
}) {
  const stationLabel = STATIONS.find((s) => s.value === station)?.label || station;

  return (
    <section aria-label="Consolidado de producción" className="flex flex-col gap-4 max-w-6xl w-full mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black text-white">
            <BarChart3 size={22} className="text-[#ffb84d]" /> Consolidado de producción · {stationLabel}
          </h1>
          <p className="text-xs font-medium text-white/60 mt-1">
            Suma en tiempo real de unidades pendientes por producto y variante de preparación en esta estación.
          </p>
        </div>
        {stationControls}
      </div>

      {loading ? (
        <p role="status" className="py-12 text-center text-sm text-white/70">Calculando consolidado…</p>
      ) : summary.length === 0 ? (
        <div className="rounded-2xl border border-white/15 bg-white/5 p-8 text-center">
          <p className="text-lg font-bold text-white">Nada pendiente por producir en {stationLabel}</p>
          <p className="mt-1 text-sm text-white/70">Todos los productos asignados a esta estación ya fueron marcados o no hay pedidos activos.</p>
          <button
            type="button"
            onClick={onBackToOrders}
            className="mt-4 min-h-[44px] rounded-xl bg-[#ffb84d] px-5 text-sm font-black text-[#0a0a0c]"
          >
            Volver a comandas
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-2xl border border-[#ffb84d]/30 bg-[#ffb84d]/10 px-4 py-3">
            <span className="text-xs font-black uppercase tracking-widest text-[#ffb84d]">
              Total en línea de producción ({stationLabel})
            </span>
            <span className="text-lg font-black text-white">{totalPending} pzas pendientes</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {summary.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#16171a] p-4 shadow-[0_10px_25px_rgba(0,0,0,0.3)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-black text-white leading-snug break-words">{item.name}</p>
                  {item.instructions.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {item.instructions.map((inst, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center rounded-lg border border-amber-400/25 bg-amber-400/12 px-2 py-0.5 text-xs font-bold text-amber-200"
                        >
                          {inst}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="shrink-0 inline-flex items-center justify-center min-w-[52px] h-[52px] px-3 rounded-2xl bg-[#88D66C]/15 border border-[#88D66C]/35 text-2xl font-black text-[#88D66C] tabular-nums">
                  {item.qtyPending}×
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function PackingOrdersView({
  orders,
  loading,
  pendingOrders,
  onToggleCheck,
  onRefresh,
}: {
  orders: PackingOrder[];
  loading: boolean;
  pendingOrders: string[];
  onToggleCheck: (orderId: string, checkKey: string, checked: boolean) => void;
  onRefresh: () => void;
}) {
  return (
    <section aria-label="Empaque de pedidos" className="flex flex-col gap-4 max-w-6xl w-full mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black text-white">
            <PackageCheck size={22} className="text-[#ffb84d]" /> Estación de Empaque
          </h1>
          <p className="text-xs font-medium text-white/60 mt-1">
            Verifica bebidas, salsas, ticket y datos de entrega. Al completar todos los puntos el pedido avanza automáticamente a LISTO.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-xs font-black uppercase tracking-wider text-white active:scale-95"
        >
          <RefreshCcw size={15} /> Actualizar
        </button>
      </div>

      {loading && orders.length === 0 ? (
        <p role="status" className="py-12 text-center text-sm text-white/70">Cargando pedidos en empaque…</p>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-white/15 bg-white/5 p-8 text-center">
          <PackageCheck size={32} className="mx-auto mb-3 text-white/40" />
          <p className="text-lg font-bold text-white">Sin pedidos pendientes en empaque</p>
          <p className="mt-1 text-sm text-white/70">
            Cuando la cocina termine un pedido para llevar o a domicilio (con etapa de empaque activa), aparecerá aquí para su verificación final.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map((order) => {
            const busy = pendingOrders.includes(order.id);
            const completedChecks = order.checks.filter((c) => c.checked).length;
            const typeLabel =
              order.orderType === "DELIVERY" ? "A domicilio" : order.orderType === "TAKEOUT" ? "Para llevar" : "En mesa";
            return (
              <article
                key={order.id}
                aria-label={`Empaque pedido ${order.orderNumber}`}
                className="flex flex-col gap-3 rounded-2xl border border-white/15 bg-[#16171a] p-4 shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xl font-black text-white">#{order.orderNumber}</span>
                    <p className="text-xs font-bold text-[#ffb84d] mt-0.5">
                      {typeLabel}
                      {order.customerName ? ` · ${order.customerName}` : ""}
                    </p>
                  </div>
                  <span className="rounded-lg bg-white/5 border border-white/10 px-2.5 py-1 text-[11px] font-bold text-white/75">
                    {completedChecks}/{order.checks.length} checks
                  </span>
                </div>

                {order.deliveryAddress && (
                  <p className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs font-semibold text-white/80">
                    📍 {order.deliveryAddress}
                  </p>
                )}

                <div className="rounded-xl bg-black/25 border border-white/5 p-3 space-y-1">
                  {order.items.map((it) => (
                    <div key={it.id} className="text-sm font-bold text-white/90">
                      <span className="text-[#ffb84d] font-black mr-1.5">{it.quantity}×</span>
                      {it.name}
                      {it.notes && <span className="block text-xs font-semibold text-amber-200 ml-5">Nota: {it.notes}</span>}
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-2 mt-auto">
                  {order.checks.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      disabled={busy}
                      aria-pressed={c.checked}
                      onClick={() => onToggleCheck(order.id, c.key, !c.checked)}
                      className="flex min-h-[48px] items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left text-xs font-black transition-transform active:scale-[0.99] disabled:opacity-50"
                      style={{
                        background: c.checked ? "rgba(136,214,108,0.14)" : "rgba(255,255,255,0.05)",
                        border: c.checked ? "1px solid rgba(136,214,108,0.4)" : "1px solid rgba(255,255,255,0.1)",
                        color: c.checked ? "#88D66C" : "rgba(255,255,255,0.9)",
                      }}
                    >
                      <span>{PACKING_CHECK_LABELS[c.key] || c.key}</span>
                      <span
                        className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                        style={{
                          background: c.checked ? "#88D66C" : "transparent",
                          border: c.checked ? "none" : "2px solid rgba(255,255,255,0.45)",
                        }}
                      >
                        {c.checked && <Check size={15} className="text-[#0c0c0e]" strokeWidth={3} />}
                      </span>
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function OrderMessageModal({
  order,
  stationLabel,
  sending,
  onCancel,
  onSubmit,
}: {
  order: KdsOrder;
  stationLabel: string;
  sending: boolean;
  onCancel: () => void;
  onSubmit: (message: string) => void;
}) {
  const [text, setText] = useState("");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0a0a0c]/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl p-6 bg-[#16171a] border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <span className="text-[10px] font-black tracking-[0.25em] uppercase text-[#ffb84d]">
              AVISO DE COCINA · {stationLabel}
            </span>
            <h3 className="text-xl font-black text-white tracking-tight mt-1">
              Pedido #{order.orderNumber || order.id.slice(-6)}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cerrar"
            className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 active:scale-95"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-2 mb-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/45">Mensajes rápidos</p>
          {QUICK_MESSAGES.map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={sending}
              onClick={() => onSubmit(preset)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-left text-xs font-bold text-white/90 hover:border-[#ffb84d]/50 active:scale-[0.99]"
            >
              {preset}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onSubmit(text);
          }}
          className="flex flex-col gap-3"
        >
          <input
            type="text"
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe un mensaje personalizado…"
            className="h-12 w-full rounded-xl border border-white/15 bg-black/30 px-3.5 text-sm text-white outline-none focus:border-[#ffb84d]"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#ffb84d] px-4 text-xs font-black uppercase tracking-widest text-[#0a0a0c] disabled:opacity-40 active:scale-95"
          >
            <Send size={14} /> {sending ? "Enviando…" : "Enviar aviso"}
          </button>
        </form>
      </div>
    </div>
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
  tickets, listening, enabled, onDismiss, onClear, history, onToggleHistory,
}: {
  tickets: TcpTicket[];
  listening: boolean;
  enabled: boolean;
  onDismiss: (id: string) => void;
  onClear: () => void;
  history: boolean;
  onToggleHistory: () => void;
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
        <button type="button" onClick={onToggleHistory} className="min-h-[44px] rounded-xl border border-white/15 px-4 text-sm font-bold">
          {history ? "Ver pendientes" : "Historial local"}
        </button>
        {!history && tickets.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-2xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest text-white/85 active:scale-95"
          >
            <Trash2 size={14} /> Archivar todas
          </button>
        )}
      </div>

      <p className="text-sm text-amber-200/90">Comandas de red local: archivar o recuperar solo cambia esta pantalla; no confirma preparación ni entrega al servidor.</p>

      {tickets.length === 0 ? (
        <div className="rounded-3xl bg-white/5 border border-white/10 p-12 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-white/5 flex items-center justify-center mb-4 text-white/40">
            <Radio size={24} />
          </div>
          <p className="text-sm font-black text-white/85 mb-1">{history ? "Sin comandas archivadas" : "Sin comandas pendientes"}</p>
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
          aria-label={ticket.archivedAt ? "Recuperar comanda local" : "Archivar comanda local"}
        >
          {ticket.archivedAt ? <RefreshCcw size={16} /> : <Check size={16} />}
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
