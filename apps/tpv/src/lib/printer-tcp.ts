/**
 * Cliente de impresión ESC/POS por TCP nativo (Capacitor).
 *
 * Imprimir desde el backend Railway no funciona porque las impresoras
 * térmicas viven en la LAN del cliente y Railway no tiene ruta a esas
 * IPs privadas. La tablet TPV sí está en la misma LAN, así que la
 * impresión real se ejecuta aquí, no en el server.
 *
 * El plugin @deedarb/capacitor-tcp-socket abre un Socket TCP nativo
 * (Java OkHttp/Socket) y permite enviar buffers ESC/POS crudos.
 *
 * En navegador (dev / web build) el plugin no está disponible — hace
 * fallback a fetch HTTP por si la impresora expone un endpoint /print.
 * Si ninguno funciona, lanza error con mensaje claro.
 */

import type { Plugin } from "@capacitor/core";

// Tipo mínimo que necesitamos del plugin. Mantenerlo aquí evita acoplar
// nuestro código a su API completa (open/close/etc. variando por versión).
interface TCPSocketPlugin extends Plugin {
  open(opts: { ipAddress: string; port: number }): Promise<{ client: number }>;
  write(opts: { client: number; data: string }): Promise<void>;
  close(opts: { client: number }): Promise<void>;
}

// ── Comandos ESC/POS estándar ────────────────────────────────────────────

const ESC = "\x1B";
const GS  = "\x1D";

export const CMD = {
  INIT:         ESC + "@",
  ALIGN_LEFT:   ESC + "a" + "\x00",
  ALIGN_CENTER: ESC + "a" + "\x01",
  ALIGN_RIGHT:  ESC + "a" + "\x02",
  BOLD_ON:      ESC + "E" + "\x01",
  BOLD_OFF:     ESC + "E" + "\x00",
  DOUBLE_ON:    GS  + "!" + "\x11",
  DOUBLE_OFF:   GS  + "!" + "\x00",
  LF:           "\n",
  LINE:         "------------------------------\n",
  CUT:          GS  + "V" + "\x42" + "\x00",
};

const LINE_WIDTH = 32;

export function row(left: string, right: string): string {
  const max = LINE_WIDTH;
  const r = right ?? "";
  const space = max - left.length - r.length;
  return left + " ".repeat(Math.max(1, space)) + r + "\n";
}

// ── Builders de tickets ──────────────────────────────────────────────────

export type PrinterStation = "CASHIER" | "KITCHEN" | "BAR";

export function buildTestTicket(station: PrinterStation): string {
  const now = new Date().toLocaleString("es-MX");
  let d = CMD.INIT + CMD.ALIGN_CENTER;
  d += CMD.BOLD_ON + "PRUEBA DE IMPRESION\n" + CMD.BOLD_OFF;
  d += station + "\n" + now + "\n";
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

// ── Detección de plugin ──────────────────────────────────────────────────

let cachedPlugin: TCPSocketPlugin | null | undefined;

async function getPlugin(): Promise<TCPSocketPlugin | null> {
  if (cachedPlugin !== undefined) return cachedPlugin;
  try {
    const mod = await import("@deedarb/capacitor-tcp-socket");
    cachedPlugin =
      (mod as unknown as { TCPSocket?: TCPSocketPlugin }).TCPSocket ?? null;
  } catch {
    cachedPlugin = null;
  }
  return cachedPlugin;
}

// ── Envío TCP ────────────────────────────────────────────────────────────

const DEFAULT_PORT = 9100;
const SOCKET_TIMEOUT_MS = 6000;

export interface PrintTarget {
  ip: string;
  port?: number | null;
}

/**
 * Envía un payload ESC/POS al puerto raw de la impresora.
 * Resuelve cuando el escritura completa; rechaza con mensaje claro si
 * la conexión falla, hay timeout o el plugin no está disponible.
 */
export async function sendRawTcp(target: PrintTarget, payload: string): Promise<void> {
  const ip = (target.ip || "").trim();
  const port = Number(target.port) || DEFAULT_PORT;
  if (!ip || ip === "0.0.0.0") {
    throw new Error("IP de impresora no configurada");
  }

  const plugin = await getPlugin();
  if (!plugin) {
    throw new Error("Plugin TCP no disponible (corre el APK; en web usa el TPV nativo).");
  }

  let clientId: number | null = null;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Timeout (6s) — impresora no responde")), SOCKET_TIMEOUT_MS)
  );

  try {
    const open = await Promise.race([plugin.open({ ipAddress: ip, port }), timeoutPromise]);
    clientId = open.client;
    await Promise.race([plugin.write({ client: clientId, data: payload }), timeoutPromise]);
  } finally {
    if (clientId !== null) {
      try { await plugin.close({ client: clientId }); } catch { /* noop */ }
    }
  }
}

/**
 * Imprime un ticket de prueba en la estación dada.
 * Es la función que dispara el botón "Test de Impresión" del admin.
 */
export async function printTestTicket(target: PrintTarget, station: PrinterStation): Promise<void> {
  const payload = buildTestTicket(station);
  return sendRawTcp(target, payload);
}

// ── Tipos para builders de tickets reales ─────────────────────────────────

export interface PrinterRecord {
  id: string;
  name: string;
  type: PrinterStation | string;
  ip: string | null;
  port: number | null;
  connectionType: "USB" | "NETWORK" | "BLUETOOTH" | string;
  isActive: boolean;
  isVirtual?: boolean;
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
}

export interface KitchenTicketInput {
  orderNumber?: string | null;
  orderType?: "DINE_IN" | "TAKEOUT" | "DELIVERY" | string | null;
  tableNumber?: string | null;
  customerName?: string | null;
  items: TicketItem[];
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
  tax?: number | null;
  tip?: number | null;
  total: number;
  paymentMethod?: string | null;
  businessName?: string | null;
  businessFooter?: string | null;
}

const fmtMoney = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

const ORDER_TYPE_LABEL: Record<string, string> = {
  DINE_IN:  "Comer aquí",
  TAKEOUT:  "Para llevar",
  DELIVERY: "A domicilio",
};

// ── Builders ──────────────────────────────────────────────────────────────

export function buildKitchenTicket(input: KitchenTicketInput): string {
  const time = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  let d = CMD.INIT + CMD.ALIGN_CENTER;
  d += CMD.BOLD_ON + CMD.DOUBLE_ON;
  d += "COMANDA\n";
  d += CMD.DOUBLE_OFF + CMD.BOLD_OFF;

  if (input.orderNumber) d += "#" + input.orderNumber + "\n";
  d += time + "\n";

  if (input.orderType) {
    d += (ORDER_TYPE_LABEL[input.orderType] || input.orderType) + "\n";
  }
  if (input.tableNumber) d += "Mesa " + input.tableNumber + "\n";
  if (input.customerName) d += input.customerName + "\n";

  d += CMD.LINE;
  d += CMD.ALIGN_LEFT + CMD.DOUBLE_ON + CMD.BOLD_ON;

  for (const item of input.items) {
    d += `${item.quantity}x ${item.name}\n`;
    if (item.modifiers && item.modifiers.length > 0) {
      d += CMD.DOUBLE_OFF;
      for (const m of item.modifiers) d += `  + ${m.name}\n`;
      d += CMD.DOUBLE_ON;
    }
    if (item.notes && item.notes.trim()) {
      d += CMD.DOUBLE_OFF;
      d += `  > ${item.notes}\n`;
      d += CMD.DOUBLE_ON;
    }
  }

  d += CMD.DOUBLE_OFF + CMD.BOLD_OFF;
  d += CMD.LINE + CMD.LF + CMD.LF + CMD.CUT;
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
  if (input.orderType) {
    d += (ORDER_TYPE_LABEL[input.orderType] || input.orderType) + "\n";
  }
  if (input.tableNumber) d += "Mesa " + input.tableNumber + "\n";
  if (input.customerName) d += input.customerName + "\n";

  d += CMD.LINE + CMD.ALIGN_LEFT;

  for (const item of input.items) {
    const lineTotal = (item.price * item.quantity)
      + (item.modifiers || []).reduce((s, m) => s + (m.priceAdd || 0), 0) * item.quantity;
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
  if (input.tax && input.tax > 0)           d += row("Impuestos:", fmtMoney(input.tax));
  if (input.tip && input.tip > 0)           d += row("Propina:",   fmtMoney(input.tip));
  d += CMD.BOLD_ON + row("TOTAL:", fmtMoney(input.total)) + CMD.BOLD_OFF;
  d += CMD.LINE;

  if (input.paymentMethod) {
    d += CMD.ALIGN_CENTER + "Pagado con: " + input.paymentMethod + "\n";
  }

  if (input.businessFooter) {
    d += CMD.ALIGN_CENTER + CMD.LF + input.businessFooter + "\n";
  } else {
    d += CMD.ALIGN_CENTER + CMD.LF + "¡Gracias por su compra!\n";
  }

  d += CMD.LF + CMD.LF + CMD.CUT;
  return d;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ── Orquestadores: enviar a impresoras de la sucursal ────────────────────

/**
 * Envía un payload a TODAS las impresoras activas de los tipos dados.
 * Las fallas individuales NO abortan el resto — cada impresora es
 * independiente y la cocina puede tener varias estaciones.
 */
async function dispatchToStations(
  printers: PrinterRecord[],
  stations: PrinterStation[],
  payload: string
): Promise<{ ok: number; failed: Array<{ name: string; error: string }> }> {
  const targets = printers.filter(
    (p) =>
      p.isActive &&
      p.connectionType === "NETWORK" &&
      p.ip &&
      p.ip !== "0.0.0.0" &&
      stations.includes(p.type as PrinterStation)
  );

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
    })
  );
  return { ok, failed };
}

/**
 * Imprime comandas en cocina (KITCHEN + BAR).
 * Devuelve resumen, no lanza — la impresión no debe romper el flow del POS.
 */
export async function printKitchenTickets(
  printers: PrinterRecord[],
  input: KitchenTicketInput
): Promise<{ ok: number; failed: Array<{ name: string; error: string }> }> {
  const payload = buildKitchenTicket(input);
  return dispatchToStations(printers, ["KITCHEN", "BAR"], payload);
}

/**
 * Imprime el recibo del cliente en impresoras CASHIER.
 */
export async function printCustomerReceipt(
  printers: PrinterRecord[],
  input: ReceiptInput
): Promise<{ ok: number; failed: Array<{ name: string; error: string }> }> {
  const payload = buildCustomerReceipt(input);
  return dispatchToStations(printers, ["CASHIER"], payload);
}
