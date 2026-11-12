import type { ParsedTicketItem } from "./escpos-parser";

export interface LocalKitchenTicket {
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
  archivedAt?: number;
}

type TicketStorage = Pick<Storage, "getItem" | "setItem">;

// No mezclar comandas de restaurantes, sucursales ni dispositivos diferentes.
export function localTicketsKey(storage: Pick<Storage, "getItem">): string {
  const scope = ["restaurantId", "locationId", "deviceId"].map((name) => storage.getItem(name));
  if (scope.some((value) => !value)) throw new Error("Falta la vinculación del dispositivo para guardar comandas locales");
  return `kds-local-tickets:v1:${scope.map((value) => encodeURIComponent(value!)).join(":")}`;
}

function validTicket(value: unknown): value is LocalKitchenTicket {
  if (!value || typeof value !== "object") return false;
  const t = value as Partial<LocalKitchenTicket>;
  const strings = (a: unknown): a is string[] => Array.isArray(a) && a.every((v) => typeof v === "string");
  return typeof t.id === "string" && Number.isFinite(t.receivedAt) && typeof t.from === "string"
    && strings(t.lines) && strings(t.headerLines) && typeof t.isKitchen === "boolean" && typeof t.isReceipt === "boolean"
    && (t.orderNumber === null || typeof t.orderNumber === "string")
    && (t.tableLabel === null || typeof t.tableLabel === "string")
    && (t.archivedAt === undefined || Number.isFinite(t.archivedAt))
    && Array.isArray(t.items) && t.items.every((item) => item && typeof item.name === "string"
      && Number.isFinite(item.quantity) && strings(item.modifiers) && strings(item.notes)
      && (item.group === undefined || typeof item.group === "string"));
}

export function readLocalTickets(storage: TicketStorage): LocalKitchenTicket[] {
  const raw = storage.getItem(localTicketsKey(storage));
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || !data.every(validTicket)) throw new Error("El respaldo de comandas locales no se pudo leer");
  return data;
}

export function writeLocalTickets(storage: TicketStorage, tickets: LocalKitchenTicket[]): void {
  // Nunca recortar pedidos activos para cumplir un límite de cantidad.
  storage.setItem(localTicketsKey(storage), JSON.stringify(tickets));
}
