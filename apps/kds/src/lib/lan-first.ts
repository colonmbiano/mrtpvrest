import type { LocalKitchenTicket } from "./local-tickets";

export type StationCode = "KITCHEN" | "BAR" | "GRILL" | "FRYER";

export interface LanFirstOrderItem {
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
  /** Etiqueta visual de estación cuando se muestra en la vista unificada de Cocina General (ej. "Plancha", "Freidora", "Barra") */
  areaLabel?: string | null;
  /** Estaciones backend donde debe replicarse el check de este ítem para mantener sincronizadas las vistas */
  syncStations?: StationCode[];
  seatNumber?: number | null;
  course?: string | null;
  modifiers?: Array<{ id: string; name: string; priceAdd?: number | null }>;
  comboSelections?: Array<{ optionMenuItemId?: string; name?: string }>;
}

export interface LanFirstOrder {
  id: string;
  orderNumber: string;
  orderType: "DINE_IN" | "TAKEOUT" | "DELIVERY";
  tableNumber?: string | null;
  customerName?: string | null;
  source?: string | null;
  createdAt: string;
  sentToKitchenAt?: string;
  notes?: string | null;
  items: LanFirstOrderItem[];
  allDone?: boolean;
  preparationComplete?: boolean;
  stationStates?: Array<{ station: StationCode; done: boolean }>;
  /** True cuando la comanda provino directamente por TCP 9100 y aún no se ha fusionado con el servidor. */
  isLocalTcp?: boolean;
  tcpTicketId?: string;
}

export type OfflineKdsMutation =
  | {
      id: string;
      type: "ITEM_DONE";
      orderId: string;
      orderNumber?: string;
      station: string;
      itemId: string;
      done: boolean;
      createdAt: number;
    }
  | {
      id: string;
      type: "ORDER_READY";
      orderId: string;
      orderNumber?: string;
      createdAt: number;
    };

export interface LanFirstState {
  /** Clave `${orderId}::${itemId}` o `${orderId}::${station}::${itemId}` -> boolean */
  itemOverrides: Record<string, boolean>;
  /** Clave `${orderNumberNormalized}::${itemIndex}` -> boolean (para comandas nacidas en TCP que luego llegan del server) */
  orderNumItemOverrides: Record<string, boolean>;
  /** IDs de órdenes finalizadas localmente pendientes de reflejarse en servidor */
  finalizedOrderIds: string[];
  /** Números de orden finalizados localmente */
  finalizedOrderNumbers: string[];
  /** Cola de mutaciones pendientes de enviar al backend */
  mutationQueue: OfflineKdsMutation[];
}

const EMPTY_STATE: LanFirstState = {
  itemOverrides: {},
  orderNumItemOverrides: {},
  finalizedOrderIds: [],
  finalizedOrderNumbers: [],
  mutationQueue: [],
};

export function normalizeOrderNumber(value?: string | null): string {
  return String(value ?? "").trim().replace(/^#+/, "").toUpperCase();
}

export function lanFirstStorageKey(storage: Pick<Storage, "getItem">): string {
  const r = storage.getItem("restaurantId") || "default";
  const l = storage.getItem("locationId") || "default";
  const d = storage.getItem("deviceId") || "default";
  return `kds-lan-first:v1:${encodeURIComponent(r)}:${encodeURIComponent(l)}:${encodeURIComponent(d)}`;
}

export function readLanFirstState(storage?: Pick<Storage, "getItem"> | null): LanFirstState {
  if (!storage) return { ...EMPTY_STATE };
  try {
    const raw = storage.getItem(lanFirstStorageKey(storage));
    if (!raw) return { ...EMPTY_STATE };
    const parsed = JSON.parse(raw) as Partial<LanFirstState>;
    return {
      itemOverrides: parsed.itemOverrides && typeof parsed.itemOverrides === "object" ? parsed.itemOverrides : {},
      orderNumItemOverrides:
        parsed.orderNumItemOverrides && typeof parsed.orderNumItemOverrides === "object"
          ? parsed.orderNumItemOverrides
          : {},
      finalizedOrderIds: Array.isArray(parsed.finalizedOrderIds) ? parsed.finalizedOrderIds : [],
      finalizedOrderNumbers: Array.isArray(parsed.finalizedOrderNumbers) ? parsed.finalizedOrderNumbers : [],
      mutationQueue: Array.isArray(parsed.mutationQueue) ? parsed.mutationQueue : [],
    };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export function writeLanFirstState(
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined,
  state: LanFirstState,
): void {
  if (!storage) return;
  try {
    storage.setItem(lanFirstStorageKey(storage), JSON.stringify(state));
  } catch {
    /* ignorar quota exceeded */
  }
}

function extractTrailingItemSequence(itemId: string): number | null {
  const match = /-(\d+)$/.exec(itemId);
  return match && match[1] ? Number(match[1]) : null;
}

function isNonKitchenFeeItem(item: LanFirstOrderItem): boolean {
  const name = (item.menuItemName || item.name || item.menuItem?.name || "").trim();
  return /^env[ií]os?$/i.test(name) || /^cargo por env[ií]o$/i.test(name);
}

/**
 * Construye la vista de comandas según la estación seleccionada:
 * - "KITCHEN" (Cocina general): unifica en una sola comanda todos los productos
 *   de todas las estaciones (Plancha + Freidora + Barra), etiquetando el área de cada uno.
 * - "GRILL" (Plancha): muestra únicamente los productos de Plancha/Cocina que NO pertenecen a Freidora.
 * - "FRYER" (Freidora): muestra únicamente los productos asignados a Freidora.
 * - "BAR" (Barra): muestra únicamente los productos de Barra (excluyendo Plancha/Freidora y cargos de envío).
 */
export function buildStationOrdersView(
  stationMap: Partial<Record<StationCode, LanFirstOrder[]>>,
  selectedStation: StationCode,
): LanFirstOrder[] {
  const kitchenOrders = stationMap.KITCHEN ?? [];
  const fryerOrders = stationMap.FRYER ?? [];
  const grillOrders = stationMap.GRILL ?? [];
  const barOrders = stationMap.BAR ?? [];

  const fryerByOrderId = new Map<string, LanFirstOrder>(fryerOrders.map((o) => [o.id, o]));
  const kitchenByOrderId = new Map<string, LanFirstOrder>(kitchenOrders.map((o) => [o.id, o]));

  // Conjunto global de itemIds que pertenecen a Freidora
  const fryerItemIds = new Set<string>();
  for (const order of fryerOrders) {
    for (const item of order.items) {
      fryerItemIds.add(item.id);
    }
  }

  // Conjunto global de itemIds que pertenecen a Cocina
  const kitchenItemIds = new Set<string>();
  for (const order of kitchenOrders) {
    for (const item of order.items) {
      kitchenItemIds.add(item.id);
    }
  }

  if (selectedStation === "FRYER") {
    return fryerOrders.flatMap<LanFirstOrder>((order) => {
      const kOrder = kitchenByOrderId.get(order.id);
      const kItemMap = new Map((kOrder?.items ?? []).map((it) => [it.id, it]));
      const items: LanFirstOrderItem[] = order.items
        .filter((it) => !isNonKitchenFeeItem(it))
        .map((it) => {
          const kItem = kItemMap.get(it.id);
          const syncStations: StationCode[] = kItem ? ["FRYER", "KITCHEN"] : ["FRYER"];
          return {
            ...it,
            station: "FRYER",
            done: it.done || Boolean(kItem?.done),
            syncStations,
          };
        });
      if (!items.length) return [];
      const allDone = items.every((i) => i.done);
      return [
        {
          ...order,
          items,
          allDone,
          preparationComplete: allDone,
        },
      ];
    });
  }

  if (selectedStation === "GRILL") {
    // Si tenemos datos de KITCHEN, Plancha son los productos de Cocina que NO son de Freidora
    const sourceOrders = kitchenOrders.length > 0 || fryerOrders.length > 0 ? kitchenOrders : grillOrders;
    return sourceOrders.flatMap<LanFirstOrder>((order) => {
      const items: LanFirstOrderItem[] = order.items
        .filter((it) => !fryerItemIds.has(it.id) && !isNonKitchenFeeItem(it))
        .map((it) => ({
          ...it,
          station: kitchenOrders.length > 0 ? "KITCHEN" : "GRILL",
          syncStations: (kitchenOrders.length > 0 ? ["KITCHEN"] : ["GRILL"]) as StationCode[],
        }));
      if (!items.length) return [];
      const allDone = items.every((i) => i.done);
      return [
        {
          ...order,
          items,
          allDone,
          preparationComplete: allDone,
        },
      ];
    });
  }

  if (selectedStation === "BAR") {
    const hasKitchenOrFryer = kitchenItemIds.size > 0 || fryerItemIds.size > 0;
    return barOrders.flatMap<LanFirstOrder>((order) => {
      const items: LanFirstOrderItem[] = order.items
        .filter((it) => {
          if (isNonKitchenFeeItem(it)) return false;
          if (hasKitchenOrFryer && (kitchenItemIds.has(it.id) || fryerItemIds.has(it.id))) {
            return false;
          }
          return true;
        })
        .map((it) => ({
          ...it,
          station: "BAR",
          syncStations: ["BAR"] as StationCode[],
        }));
      if (!items.length) return [];
      const allDone = items.every((i) => i.done);
      return [
        {
          ...order,
          items,
          allDone,
          preparationComplete: allDone,
        },
      ];
    });
  }

  // selectedStation === "KITCHEN" (Cocina General):
  // Unificar todas las estaciones en una sola comanda por pedido
  const orderedIds: string[] = [];
  const seenOrderIds = new Set<string>();
  for (const list of [kitchenOrders, fryerOrders, grillOrders, barOrders]) {
    for (const order of list) {
      if (!seenOrderIds.has(order.id)) {
        seenOrderIds.add(order.id);
        orderedIds.push(order.id);
      }
    }
  }

  const hasMultipleStations = fryerOrders.length > 0;
  const unified: LanFirstOrder[] = [];

  for (const orderId of orderedIds) {
    const kOrder = kitchenByOrderId.get(orderId);
    const fOrder = fryerByOrderId.get(orderId);
    const baseOrder = kOrder || fOrder;
    if (!baseOrder) continue;

    const kItemMap = new Map((kOrder?.items ?? []).map((it) => [it.id, it]));
    const fItemMap = new Map((fOrder?.items ?? []).map((it) => [it.id, it]));

    const allItemIds: string[] = [];
    const seenItems = new Set<string>();
    for (const it of [...(kOrder?.items ?? []), ...(fOrder?.items ?? [])]) {
      if (!seenItems.has(it.id) && !isNonKitchenFeeItem(it)) {
        seenItems.add(it.id);
        allItemIds.push(it.id);
      }
    }

    // Ordenar ítems según su secuencia original dentro del pedido si sus IDs terminan en -0, -1, -2...
    allItemIds.sort((a, b) => {
      const seqA = extractTrailingItemSequence(a);
      const seqB = extractTrailingItemSequence(b);
      if (seqA !== null && seqB !== null) return seqA - seqB;
      return 0;
    });

    const mergedItems: LanFirstOrderItem[] = [];
    for (const itemId of allItemIds) {
      const kItem = kItemMap.get(itemId);
      const fItem = fItemMap.get(itemId);
      const baseItem = fItem || kItem;
      if (!baseItem) continue;

      if (fItem) {
        const syncStations: StationCode[] = kItem ? ["FRYER", "KITCHEN"] : ["FRYER"];
        mergedItems.push({
          ...baseItem,
          station: "FRYER",
          areaLabel: "Freidora",
          done: Boolean(fItem.done || kItem?.done),
          syncStations,
        });
      } else if (kItem) {
        mergedItems.push({
          ...kItem,
          station: "KITCHEN",
          areaLabel: hasMultipleStations ? "Plancha" : (kItem.areaLabel ?? null),
          done: Boolean(kItem.done),
          syncStations: ["KITCHEN"],
        });
      }
    }

    if (mergedItems.length === 0) continue;

    const allDone = mergedItems.every((i) => i.done);
    unified.push({
      ...baseOrder,
      items: mergedItems,
      allDone,
      preparationComplete: allDone,
    });
  }

  return unified;
}

function inferOrderType(ticket: LocalKitchenTicket): "DINE_IN" | "TAKEOUT" | "DELIVERY" {
  const headerText = [ticket.tableLabel || "", ...ticket.headerLines].join(" ").toUpperCase();
  if (headerText.includes("DOMICILIO") || headerText.includes("DELIVERY") || headerText.includes("ENVIO")) {
    return "DELIVERY";
  }
  if (headerText.includes("LLEVAR") || headerText.includes("RECOGER") || headerText.includes("TAKEOUT")) {
    return "TAKEOUT";
  }
  return "DINE_IN";
}

export function tcpTicketToKdsOrder(
  ticket: LocalKitchenTicket,
  station: string,
  state: LanFirstState,
): LanFirstOrder | null {
  if (ticket.archivedAt || ticket.isReceipt) return null;
  if (!ticket.items || ticket.items.length === 0) return null;

  const orderId = `tcp-order:${ticket.id}`;
  const orderNumber = ticket.orderNumber || ticket.id.slice(-4).toUpperCase();
  const normNum = normalizeOrderNumber(orderNumber);

  if (
    state.finalizedOrderIds.includes(orderId) ||
    (normNum && state.finalizedOrderNumbers.includes(normNum))
  ) {
    return null;
  }

  const items: LanFirstOrderItem[] = ticket.items.map((it, idx) => {
    const itemId = `${orderId}:item:${idx}`;
    const directKey = `${orderId}::${itemId}`;
    const overrideKey = `${orderId}::${station}::${itemId}`;
    const numKey = normNum ? `${normNum}::${idx}` : "";
    const done =
      state.itemOverrides[directKey] ??
      state.itemOverrides[overrideKey] ??
      (numKey ? state.orderNumItemOverrides[numKey] : undefined) ??
      false;

    return {
      id: itemId,
      menuItemId: `tcp-item:${it.name.toLowerCase().replace(/\s+/g, "-")}`,
      menuItemName: it.name,
      name: it.name,
      quantity: it.quantity,
      done,
      notes: it.notes.length > 0 ? it.notes.join(" · ") : null,
      station,
      course: it.group || null,
      modifiers: it.modifiers.map((m, mIdx) => ({
        id: `${itemId}:mod:${mIdx}`,
        name: m,
      })),
    };
  });

  const allDone = items.length > 0 && items.every((i) => i.done);
  const iso = new Date(ticket.receivedAt).toISOString();

  return {
    id: orderId,
    orderNumber,
    orderType: inferOrderType(ticket),
    tableNumber: ticket.tableLabel,
    customerName: ticket.headerLines[0] || null,
    source: "LAN TCP",
    createdAt: iso,
    sentToKitchenAt: iso,
    notes: null,
    items,
    allDone,
    preparationComplete: allDone,
    isLocalTcp: true,
    tcpTicketId: ticket.id,
  };
}

/**
 * Combina los pedidos del servidor con el estado local-first (optimistic UI +
 * cola offline) y las comandas TCP 9100 que aún no están en la respuesta del
 * servidor, deduplicando por `orderNumber`.
 */
export function mergeServerAndTcpOrders(
  serverOrders: LanFirstOrder[],
  tcpTickets: LocalKitchenTicket[],
  station: string,
  state: LanFirstState,
  includeTcpInMainBoard = true,
): LanFirstOrder[] {
  const seenOrderNumbers = new Set<string>();
  const result: LanFirstOrder[] = [];

  for (const order of serverOrders) {
    const normNum = normalizeOrderNumber(order.orderNumber);
    if (normNum) seenOrderNumbers.add(normNum);

    if (
      state.finalizedOrderIds.includes(order.id) ||
      (normNum && state.finalizedOrderNumbers.includes(normNum))
    ) {
      continue;
    }

    const updatedItems = order.items.map((item, idx) => {
      const directKey = `${order.id}::${item.id}`;
      const itemStationKey = `${order.id}::${item.station || station}::${item.id}`;
      const tabStationKey = `${order.id}::${station}::${item.id}`;
      const numKey = normNum ? `${normNum}::${idx}` : "";

      const hasDirect = Object.prototype.hasOwnProperty.call(state.itemOverrides, directKey);
      const hasItemStation = Object.prototype.hasOwnProperty.call(state.itemOverrides, itemStationKey);
      const hasTabStation = Object.prototype.hasOwnProperty.call(state.itemOverrides, tabStationKey);
      const hasNumOverride = numKey && Object.prototype.hasOwnProperty.call(state.orderNumItemOverrides, numKey);

      const done = hasDirect
        ? Boolean(state.itemOverrides[directKey])
        : hasItemStation
          ? Boolean(state.itemOverrides[itemStationKey])
          : hasTabStation
            ? Boolean(state.itemOverrides[tabStationKey])
            : hasNumOverride
              ? Boolean(state.orderNumItemOverrides[numKey])
              : item.done;
      return { ...item, done };
    });

    const allDone = updatedItems.length > 0 && updatedItems.every((i) => i.done);
    const otherStationsPending = (order.stationStates || []).some(
      (s) => s.station !== station && !s.done,
    );
    const preparationComplete = allDone && !otherStationsPending;

    result.push({
      ...order,
      items: updatedItems,
      allDone,
      preparationComplete,
    });
  }

  if (includeTcpInMainBoard) {
    for (const ticket of tcpTickets) {
      const normNum = normalizeOrderNumber(ticket.orderNumber);
      if (normNum && seenOrderNumbers.has(normNum)) {
        continue;
      }
      const converted = tcpTicketToKdsOrder(ticket, station, state);
      if (converted) {
        if (normNum) seenOrderNumbers.add(normNum);
        result.push(converted);
      }
    }
  }

  return result;
}
