/**
 * Cliente de impresión ESC/POS por TCP nativo (Capacitor) para Meseros Lite.
 *
 * Portado del cliente del TPV (apps/tpv/src/lib/printer-tcp.ts). Imprimir
 * desde el backend Railway no funciona porque las impresoras térmicas viven
 * en la LAN del cliente y Railway no tiene ruta a esas IPs privadas. La
 * tablet sí está en la misma LAN, así que la impresión real se ejecuta aquí.
 *
 * El plugin `capacitor-tcp-socket` abre un Socket TCP nativo y permite enviar
 * buffers ESC/POS crudos. En navegador (dev/web) el plugin no está disponible
 * y sendRawTcp lanza un error con mensaje claro.
 */

import type { Plugin } from "@capacitor/core";

interface TCPSocketPlugin extends Plugin {
  connect(opts: { ipAddress: string; port?: number }): Promise<{ client: number }>;
  send(opts: { client: number; data: string; encoding?: "utf8" | "base64" | "hex" }): Promise<void>;
  disconnect(opts: { client: number }): Promise<{ client: number }>;
}

// ── Comandos ESC/POS estándar ────────────────────────────────────────────

const ESC = "\x1B";
const GS = "\x1D";

export const CMD = {
  INIT: ESC + "@",
  ALIGN_LEFT: ESC + "a" + "\x00",
  ALIGN_CENTER: ESC + "a" + "\x01",
  ALIGN_RIGHT: ESC + "a" + "\x02",
  BOLD_ON: ESC + "E" + "\x01",
  BOLD_OFF: ESC + "E" + "\x00",
  DOUBLE_ON: GS + "!" + "\x11",
  DOUBLE_OFF: GS + "!" + "\x00",
  TRIPLE_ON: GS + "!" + "\x22",
  LF: "\n",
  LINE: "------------------------------\n",
  CUT: GS + "V" + "\x42" + "\x00",
};

const LINE_WIDTH = 32;

function normalizeThermalText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¡¿]/g, "")
    .replace(/[·•]/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/[^\x00-\x7F]/g, "");
}

export function row(left: string, right: string): string {
  const r = right ?? "";
  const space = LINE_WIDTH - left.length - r.length;
  return left + " ".repeat(Math.max(1, space)) + r + "\n";
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

const fmtMoney = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

const ORDER_TYPE_LABEL: Record<string, string> = {
  DINE_IN: "Comer aquí",
  TAKEOUT: "Para llevar",
  DELIVERY: "A domicilio",
};

// ── Detección de plugin ──────────────────────────────────────────────────
//
// El objeto que devuelve registerPlugin de @capacitor/core es un Proxy que
// intercepta TODO acceso, incluido `.then`. Si lo devolvemos desde una
// función async, el runtime lo trata como "thenable" y Android responde
// "TcpSocket.then() is not implemented". Solución: separar la init (async,
// dynamic import) de la lectura del plugin (sync, vía un box NO thenable).

let cachedBox: { plugin: TCPSocketPlugin | null } | null = null;
let initPromise: Promise<void> | null = null;

function getPluginSync(): TCPSocketPlugin | null {
  return cachedBox?.plugin ?? null;
}

async function ensurePlugin(): Promise<void> {
  if (cachedBox) return;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const mod = await import("capacitor-tcp-socket");
        const exported = mod as unknown as {
          TcpSocket?: TCPSocketPlugin;
          TCPSocket?: TCPSocketPlugin;
          default?: TCPSocketPlugin;
        };
        const plugin = exported.TcpSocket ?? exported.TCPSocket ?? exported.default ?? null;
        cachedBox = { plugin };
      } catch {
        cachedBox = { plugin: null };
      }
    })();
  }
  await initPromise;
}

// ── Envío TCP ────────────────────────────────────────────────────────────

const DEFAULT_PORT = 9100;
const SOCKET_TIMEOUT_MS = 6000;
const PRINT_RETRIES = 3;
const RETRY_BACKOFF_MS = [200, 500];
const SETTLE_AFTER_PRINT_MS = 150;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const ipLocks = new Map<string, Promise<void>>();

function withIpLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = ipLocks.get(key) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  ipLocks.set(key, run.then(() => {}, () => {}));
  return run;
}

export interface PrintTarget {
  ip: string;
  port?: number | null;
}

async function attemptSendRawTcp(
  plugin: TCPSocketPlugin,
  ip: string,
  port: number,
  payload: string,
): Promise<void> {
  let clientId: number | null = null;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Timeout (6s) — impresora no responde")), SOCKET_TIMEOUT_MS),
  );

  try {
    const conn = await Promise.race([plugin.connect({ ipAddress: ip, port }), timeoutPromise]);
    clientId = conn.client;
    const safePayload = normalizeThermalText(payload);
    await Promise.race([
      plugin.send({ client: clientId, data: safePayload, encoding: "utf8" }),
      timeoutPromise,
    ]);
  } finally {
    if (clientId !== null) {
      try {
        await plugin.disconnect({ client: clientId });
      } catch {
        /* noop */
      }
    }
  }
}

export async function sendRawTcp(target: PrintTarget, payload: string): Promise<void> {
  const ip = (target.ip || "").trim();
  const port = Number(target.port) || DEFAULT_PORT;
  if (!ip || ip === "0.0.0.0") {
    throw new Error("IP de impresora no configurada");
  }

  await ensurePlugin();
  const plugin = getPluginSync();
  if (!plugin) {
    throw new Error("Plugin TCP no disponible (corre el APK; en web no hay impresión).");
  }

  return withIpLock(`${ip}:${port}`, async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < PRINT_RETRIES; attempt += 1) {
      try {
        await attemptSendRawTcp(plugin, ip, port, payload);
        await delay(SETTLE_AFTER_PRINT_MS);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < PRINT_RETRIES - 1) {
          await delay(RETRY_BACKOFF_MS[attempt] ?? 500);
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Fallo de impresion TCP tras reintentos");
  });
}

// ── Tipos ──────────────────────────────────────────────────────────────────

export type PrinterStation = "CASHIER" | "KITCHEN" | "BAR";

export interface PrinterRecord {
  id: string;
  name: string;
  type: PrinterStation | string;
  ip: string | null;
  port: number | null;
  connectionType: "USB" | "NETWORK" | "BLUETOOTH" | string;
  isActive: boolean;
  isVirtual?: boolean;
  stations?: string[];
  printerGroupIds?: string[];
  printerGroupRefs?: Array<{ id: string; name: string }>;
}

export interface TicketModifier {
  name: string;
  priceAdd?: number;
}

export interface TicketItem {
  name: string;
  quantity: number;
  price: number;
  notes?: string | null;
  modifiers?: TicketModifier[] | null;
  printerGroupIds?: string[];
}

export interface KitchenTicketConfig {
  header?: string;
  footer?: string;
  showOrderNumber?: boolean;
  showTime?: boolean;
  showOrderType?: boolean;
  showTableNumber?: boolean;
  showCustomerName?: boolean;
  showModifiers?: boolean;
  showNotes?: boolean;
  groupBySeat?: boolean;
  separateByGroup?: boolean;
  fontSize?: "normal" | "large" | "xlarge";
}

export interface KitchenTicketInput {
  orderNumber?: string | null;
  orderType?: "DINE_IN" | "TAKEOUT" | "DELIVERY" | string | null;
  tableNumber?: string | null;
  customerName?: string | null;
  items: TicketItem[];
  assignmentName?: string | null;
  config?: KitchenTicketConfig;
}

export interface ReceiptInput {
  orderNumber?: string | null;
  orderType?: "DINE_IN" | "TAKEOUT" | "DELIVERY" | string | null;
  tableNumber?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  items: TicketItem[];
  subtotal: number;
  discount?: number | null;
  total: number;
  paymentMethod?: string | null;
  businessName?: string | null;
  businessFooter?: string | null;
}

// ── Builders ──────────────────────────────────────────────────────────────

export function buildTestTicket(station: PrinterStation): string {
  const now = new Date().toLocaleString("es-MX");
  let d = CMD.INIT + CMD.ALIGN_CENTER;
  d += CMD.BOLD_ON + "PRUEBA DE IMPRESION\n" + CMD.BOLD_OFF;
  d += "Meseros Lite\n" + station + "\n" + now + "\n";
  d += CMD.LINE;
  if (station === "CASHIER") {
    d += CMD.ALIGN_LEFT;
    d += row("1x Hamburguesa", "$120.00");
    d += row("2x Refresco", "$60.00");
    d += CMD.LINE;
    d += CMD.BOLD_ON + row("TOTAL:", "$180.00") + CMD.BOLD_OFF;
  } else {
    d += CMD.DOUBLE_ON + CMD.BOLD_ON;
    d += "2x Hamburguesa\n1x Papas\n";
    d += CMD.DOUBLE_OFF + CMD.BOLD_OFF;
    d += CMD.BOLD_ON + "*** Sin cebolla ***\n" + CMD.BOLD_OFF;
  }
  d += CMD.LINE + CMD.ALIGN_CENTER + "OK\n" + CMD.LF + CMD.LF + CMD.CUT;
  return d;
}

export function buildKitchenTicket(input: KitchenTicketInput): string {
  const time = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  const cfg: Required<KitchenTicketConfig> = {
    header: input.config?.header ?? "COMANDA",
    footer: input.config?.footer ?? "",
    showOrderNumber: input.config?.showOrderNumber ?? true,
    showTime: input.config?.showTime ?? true,
    showOrderType: input.config?.showOrderType ?? true,
    showTableNumber: input.config?.showTableNumber ?? true,
    showCustomerName: input.config?.showCustomerName ?? true,
    showModifiers: input.config?.showModifiers ?? true,
    showNotes: input.config?.showNotes ?? true,
    groupBySeat: input.config?.groupBySeat ?? true,
    separateByGroup: input.config?.separateByGroup ?? false,
    fontSize: input.config?.fontSize ?? "large",
  };

  const itemSizeOn =
    cfg.fontSize === "normal" ? "" : cfg.fontSize === "xlarge" ? CMD.TRIPLE_ON : CMD.DOUBLE_ON;
  const itemSizeOff = cfg.fontSize === "normal" ? "" : CMD.DOUBLE_OFF;

  let d = CMD.INIT + CMD.ALIGN_CENTER;

  if (cfg.header.trim()) {
    d += CMD.BOLD_ON + CMD.DOUBLE_ON;
    d += cfg.header.trim() + "\n";
    d += CMD.DOUBLE_OFF + CMD.BOLD_OFF;
  }

  if (input.assignmentName?.trim()) {
    d += CMD.BOLD_ON + CMD.DOUBLE_ON;
    d += input.assignmentName.trim().toUpperCase() + "\n";
    d += CMD.DOUBLE_OFF + CMD.BOLD_OFF;
  }

  if (cfg.showOrderNumber && input.orderNumber) d += "#" + input.orderNumber + "\n";
  if (cfg.showTime) d += time + "\n";
  if (cfg.showOrderType && input.orderType) {
    d += (ORDER_TYPE_LABEL[input.orderType] || input.orderType) + "\n";
  }
  if (cfg.showTableNumber && input.tableNumber) d += "Mesa " + input.tableNumber + "\n";
  if (cfg.showCustomerName && input.customerName) d += input.customerName + "\n";

  d += CMD.LINE + CMD.ALIGN_LEFT;

  for (const item of input.items) {
    d += itemSizeOn + CMD.BOLD_ON;
    d += `${item.quantity}x ${item.name}\n`;
    if (cfg.showModifiers && item.modifiers && item.modifiers.length > 0) {
      d += itemSizeOff;
      for (const m of item.modifiers) d += `  + ${m.name}\n`;
      d += itemSizeOn;
    }
    if (cfg.showNotes && item.notes && item.notes.trim()) {
      d += itemSizeOff;
      d += `  > ${item.notes}\n`;
      d += itemSizeOn;
    }
    d += itemSizeOff + CMD.BOLD_OFF;
  }

  d += CMD.LINE;
  if (cfg.footer.trim()) {
    d += CMD.ALIGN_CENTER + cfg.footer.trim() + "\n" + CMD.ALIGN_LEFT;
  }
  d += CMD.LF + CMD.LF + CMD.CUT;
  return d;
}

export function buildCustomerReceipt(input: ReceiptInput): string {
  const now = new Date().toLocaleString("es-MX");
  let d = CMD.INIT + CMD.ALIGN_CENTER;

  if (input.businessName) {
    d += CMD.BOLD_ON + CMD.DOUBLE_ON + input.businessName + "\n" + CMD.DOUBLE_OFF + CMD.BOLD_OFF;
  }
  d += now + "\n";
  if (input.orderNumber) d += "Orden #" + input.orderNumber + "\n";
  if (input.orderType) d += (ORDER_TYPE_LABEL[input.orderType] || input.orderType) + "\n";
  if (input.tableNumber) d += "Mesa " + input.tableNumber + "\n";
  if (input.customerName) d += input.customerName + "\n";

  d += CMD.LINE + CMD.ALIGN_LEFT;

  for (const item of input.items) {
    const lineTotal =
      item.price * item.quantity +
      (item.modifiers || []).reduce((s, m) => s + (m.priceAdd || 0), 0) * item.quantity;
    d += row(`${item.quantity}x ${truncate(item.name, 18)}`, fmtMoney(lineTotal));
    if (item.modifiers && item.modifiers.length > 0) {
      for (const m of item.modifiers) {
        const extra = m.priceAdd ? ` (+${fmtMoney(m.priceAdd)})` : "";
        d += `  · ${m.name}${extra}\n`;
      }
    }
  }

  d += CMD.LINE;
  d += row("Subtotal:", fmtMoney(input.subtotal));
  if (input.discount && input.discount > 0) d += row("Descuento:", "-" + fmtMoney(input.discount));
  d += CMD.BOLD_ON + row("TOTAL:", fmtMoney(input.total)) + CMD.BOLD_OFF;
  d += CMD.LINE;
  if (input.paymentMethod) d += CMD.ALIGN_CENTER + "Pago: " + input.paymentMethod + "\n";
  d += CMD.ALIGN_CENTER + CMD.LF + (input.businessFooter || "¡Gracias por su compra!") + "\n";
  d += CMD.LF + CMD.LF + CMD.CUT;
  return d;
}

// ── Orquestadores ──────────────────────────────────────────────────────────

export interface DispatchResult {
  ok: number;
  failed: Array<{ name: string; error: string }>;
}

function isNetworkTarget(p: PrinterRecord): boolean {
  return p.isActive && p.connectionType === "NETWORK" && Boolean(p.ip) && p.ip !== "0.0.0.0";
}

async function dispatchToStations(
  printers: PrinterRecord[],
  stations: PrinterStation[],
  payload: string,
): Promise<DispatchResult> {
  const targets = printers.filter((p) => {
    if (!isNetworkTarget(p)) return false;
    if (Array.isArray(p.stations) && p.stations.length > 0) {
      return p.stations.some((s) => stations.includes(s as PrinterStation));
    }
    return stations.includes(p.type as PrinterStation);
  });

  let ok = 0;
  const failed: Array<{ name: string; error: string }> = [];
  await Promise.all(
    targets.map(async (p) => {
      try {
        await sendRawTcp({ ip: p.ip as string, port: p.port }, payload);
        ok += 1;
      } catch (e) {
        const err = e as { message?: string };
        failed.push({ name: p.name, error: err?.message || "fallo TCP" });
      }
    }),
  );
  return { ok, failed };
}

/**
 * Imprime comandas en cocina (KITCHEN + BAR). Si algún item trae
 * printerGroupIds, enruta cada item a las impresoras de su grupo (un ticket
 * por impresora con solo sus items). Si ninguno trae grupos, fallback al
 * dispatch legacy KITCHEN+BAR. No lanza — imprimir no debe romper el flujo.
 */
export async function printKitchenTickets(
  printers: PrinterRecord[],
  input: KitchenTicketInput,
): Promise<DispatchResult> {
  const itemsWithGroups = input.items.filter(
    (it) => Array.isArray(it.printerGroupIds) && it.printerGroupIds.length > 0,
  );

  if (itemsWithGroups.length === 0) {
    return dispatchToStations(printers, ["KITCHEN", "BAR"], buildKitchenTicket(input));
  }

  if (input.config?.separateByGroup) {
    const jobs = new Map<
      string,
      { printer: PrinterRecord; assignmentName: string; items: TicketItem[] }
    >();

    for (const item of input.items) {
      const groupIds = item.printerGroupIds ?? [];
      for (const printer of printers) {
        if (!isNetworkTarget(printer)) continue;
        for (const group of printer.printerGroupRefs ?? []) {
          if (!groupIds.includes(group.id)) continue;
          const key = `${printer.id}:${group.id}`;
          const job = jobs.get(key) ?? {
            printer,
            assignmentName: group.name,
            items: [],
          };
          if (!job.items.includes(item)) job.items.push(item);
          jobs.set(key, job);
        }
      }
    }

    if (jobs.size > 0) {
      let ok = 0;
      const failed: Array<{ name: string; error: string }> = [];
      await Promise.all(
        Array.from(jobs.values()).map(async ({ printer, assignmentName, items }) => {
          try {
            await sendRawTcp(
              { ip: printer.ip as string, port: printer.port },
              buildKitchenTicket({ ...input, items, assignmentName }),
            );
            ok += 1;
          } catch (error) {
            const detail = error as { message?: string };
            failed.push({
              name: `${printer.name} - ${assignmentName}`,
              error: detail.message || "fallo TCP",
            });
          }
        }),
      );
      return { ok, failed };
    }
  }

  const itemsByPrinter = new Map<string, TicketItem[]>();
  for (const item of input.items) {
    const groupIds = item.printerGroupIds ?? [];
    if (groupIds.length === 0) continue;
    for (const printer of printers) {
      if (!isNetworkTarget(printer)) continue;
      const printerGroupIds = printer.printerGroupIds ?? [];
      if (printerGroupIds.length === 0) continue;
      if (printerGroupIds.some((gid) => groupIds.includes(gid))) {
        const arr = itemsByPrinter.get(printer.id) ?? [];
        if (!arr.includes(item)) arr.push(item);
        itemsByPrinter.set(printer.id, arr);
      }
    }
  }

  if (itemsByPrinter.size === 0) {
    return dispatchToStations(printers, ["KITCHEN", "BAR"], buildKitchenTicket(input));
  }

  let ok = 0;
  const failed: Array<{ name: string; error: string }> = [];
  await Promise.all(
    Array.from(itemsByPrinter.entries()).map(async ([printerId, items]) => {
      const printer = printers.find((p) => p.id === printerId);
      if (!printer) return;
      try {
        await sendRawTcp({ ip: printer.ip as string, port: printer.port }, buildKitchenTicket({ ...input, items }));
        ok += 1;
      } catch (e) {
        const err = e as { message?: string };
        failed.push({ name: printer.name, error: err?.message || "fallo TCP" });
      }
    }),
  );
  return { ok, failed };
}

export async function printCustomerReceipt(
  printers: PrinterRecord[],
  input: ReceiptInput,
): Promise<DispatchResult> {
  return dispatchToStations(printers, ["CASHIER"], buildCustomerReceipt(input));
}

export async function printTestTicket(target: PrintTarget, station: PrinterStation): Promise<void> {
  return sendRawTcp(target, buildTestTicket(station));
}
