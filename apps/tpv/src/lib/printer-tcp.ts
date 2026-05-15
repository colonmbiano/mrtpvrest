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

// API del plugin `capacitor-tcp-socket` v7+. Tipo local — no exponemos
// el namespace completo del paquete para no acoplarnos.
interface TCPSocketPlugin extends Plugin {
  connect(opts: { ipAddress: string; port?: number }): Promise<{ client: number }>;
  send(opts: { client: number; data: string; encoding?: "utf8" | "base64" | "hex" }): Promise<void>;
  disconnect(opts: { client: number }): Promise<{ client: number }>;
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
//
// IMPORTANTE: el objeto que devuelve `registerPlugin` de @capacitor/core es
// un Proxy que intercepta TODO acceso a propiedades, incluido `.then`. Si
// devolvemos esa instancia desde una función `async` (o la pasamos a
// `Promise.resolve`/`new Promise(res => res(p))`), el runtime la trata como
// "thenable" e invoca `plugin.then(resolve, reject)` como parte del unwrap.
// Capacitor Android responde con el error nativo:
//
//     "TcpSocket.then() is not implemented on android"
//
// y la promesa que la envuelve se rechaza para SIEMPRE → el botón "Test
// impresión" se queda en "conectando" sin disparar nada útil.
//
// Solución: separar la inicialización (async, vía dynamic import) de la
// consulta del plugin (sync, lee de un wrapper { plugin } que NO es
// thenable). Así en `sendRawTcp` hacemos `await ensurePlugin()` y luego
// `const plugin = getPluginSync()` que devuelve la instancia sin pasar por
// ningún Promise.

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
        // OJO: leemos en variable local para que el resto de esta función
        // no devuelva el plugin directamente. Lo guardamos detrás del box.
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

  await ensurePlugin();
  const plugin = getPluginSync();
  if (!plugin) {
    throw new Error("Plugin TCP no disponible (corre el APK; en web usa el TPV nativo).");
  }

  let clientId: number | null = null;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Timeout (6s) — impresora no responde")), SOCKET_TIMEOUT_MS)
  );

  try {
    const conn = await Promise.race([plugin.connect({ ipAddress: ip, port }), timeoutPromise]);
    clientId = conn.client;
    // ESC/POS es binario pero el plugin acepta utf8 → enviamos como string
    // raw porque buildXTicket genera bytes en code page latin1 compatible.
    await Promise.race([plugin.send({ client: clientId, data: payload, encoding: "utf8" }), timeoutPromise]);
  } finally {
    if (clientId !== null) {
      try { await plugin.disconnect({ client: clientId }); } catch { /* noop */ }
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
  // Estaciones que cubre. Cuando vacío, se usa solo `type` como
  // fallback (impresora térmica tradicional con un único rol).
  // Cuando tiene contenido, dispatchToStations considera la unión:
  // un Printer con stations=[KITCHEN,BAR] recibirá comandas de
  // ambas estaciones aunque su `type` siga siendo KITCHEN.
  stations?: string[];
  // Printer Groups de los que este Printer es miembro. Llenado por el
  // caller cuando GET /api/printers regrese los joins (ver
  // SidebarTicket.fetchPrinters). Vacío = el printer no participa del
  // enrutamiento por groups y solo le llegan tickets si está en el
  // fallback legacy (type/stations match).
  printerGroupIds?: string[];
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
  // En DINE_IN: a qué comensal pertenece. null = compartido.
  seatNumber?: number | null;
  // Printer Groups resueltos para este item — override item-level si
  // existe, default heredado de la categoría si no. El dispatcher usa
  // este array para enrutar la comanda a las impresoras correctas.
  printerGroupIds?: string[];
}

export interface KitchenTicketInput {
  orderNumber?: string | null;
  orderType?: "DINE_IN" | "TAKEOUT" | "DELIVERY" | string | null;
  tableNumber?: string | null;
  customerName?: string | null;
  items: TicketItem[];
  /** Si true, prepende un banner "*** REIMPRESION ***" al ticket para
   *  que cocina identifique la duplicación y no prepare 2 veces. */
  isReprint?: boolean;
  /** Si true, marca el ticket como "PARCIAL" — se está reimprimiendo
   *  solo un subset de los items originales. */
  isPartial?: boolean;
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

  // Banner de reimpresión — bien visible para que el cocinero NO prepare
  // los items dos veces. Va antes del header normal y usa el modo doble
  // ancho para asegurar legibilidad incluso en quemadores con poco contraste.
  if (input.isReprint) {
    d += CMD.BOLD_ON + CMD.DOUBLE_ON;
    d += "*** REIMPRESION ***\n";
    d += CMD.DOUBLE_OFF + CMD.BOLD_OFF;
    if (input.isPartial) {
      d += CMD.BOLD_ON + "(parcial)\n" + CMD.BOLD_OFF;
    }
    d += CMD.LINE;
  }

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
  d += CMD.ALIGN_LEFT;

  // Para DINE_IN agrupamos por comensal cuando hay items repartidos entre
  // 2+ buckets (seat numerado o compartido). Cocina necesita saber a quién
  // preparar cada plato cuando una mesa tiene varios comensales con
  // pedidos distintos. Para TAKEOUT/DELIVERY o cuando todos los items
  // están en el mismo bucket, se mantiene la salida plana de siempre.
  const isDineIn = input.orderType === "DINE_IN";
  const seatBuckets = new Map<number | "shared", TicketItem[]>();
  if (isDineIn) {
    for (const it of input.items) {
      const key: number | "shared" =
        typeof it.seatNumber === "number" ? it.seatNumber : "shared";
      const arr = seatBuckets.get(key) ?? [];
      arr.push(it);
      seatBuckets.set(key, arr);
    }
  }
  const shouldGroupBySeat = isDineIn && seatBuckets.size >= 2;

  const renderItem = (item: TicketItem) => {
    let s = CMD.DOUBLE_ON + CMD.BOLD_ON;
    s += `${item.quantity}x ${item.name}\n`;
    if (item.modifiers && item.modifiers.length > 0) {
      s += CMD.DOUBLE_OFF;
      for (const m of item.modifiers) s += `  + ${m.name}\n`;
      s += CMD.DOUBLE_ON;
    }
    if (item.notes && item.notes.trim()) {
      s += CMD.DOUBLE_OFF;
      s += `  > ${item.notes}\n`;
      s += CMD.DOUBLE_ON;
    }
    s += CMD.DOUBLE_OFF + CMD.BOLD_OFF;
    return s;
  };

  if (shouldGroupBySeat) {
    // Comensales numerados ordenados ascendente; "shared" siempre al final.
    const seatedKeys = Array.from(seatBuckets.keys())
      .filter((k): k is number => typeof k === "number")
      .sort((a, b) => a - b);
    const orderedKeys: (number | "shared")[] = [...seatedKeys];
    if (seatBuckets.has("shared")) orderedKeys.push("shared");

    orderedKeys.forEach((key, idx) => {
      if (idx > 0) d += "\n"; // separación visual entre comensales
      const header = key === "shared" ? "COMPARTIDO" : `COMENSAL ${key}`;
      d += CMD.BOLD_ON + header + "\n" + CMD.BOLD_OFF;
      for (const item of seatBuckets.get(key) ?? []) {
        d += renderItem(item);
      }
    });
  } else {
    for (const item of input.items) {
      d += renderItem(item);
    }
  }

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
  const targets = printers.filter((p) => {
    if (!p.isActive) return false;
    if (p.connectionType !== "NETWORK") return false;
    if (!p.ip || p.ip === "0.0.0.0") return false;
    // Match por stations[] tiene prioridad cuando está definido (KDS
    // multi-estación); si no, fallback al `type` single.
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
    })
  );
  return { ok, failed };
}

/**
 * Imprime comandas en cocina (KITCHEN + BAR).
 *
 * Algoritmo de enrutamiento (Loyverse-like):
 *   1. Si CUALQUIER item del ticket tiene `printerGroupIds`, agrupamos
 *      items por printer destino (resuelto via PrinterGroupMember) y
 *      mandamos un ticket POR PRINTER con SOLO los items que le tocan.
 *      Multi-grupo: un item con N groups manda a printers de los N
 *      groups, deduplicado.
 *   2. Si NINGÚN item trae printerGroupIds → fallback al comportamiento
 *      legacy (dispatchToStations KITCHEN+BAR), igual que antes para no
 *      romper instalaciones que aún no han configurado groups.
 *
 * No lanza — la impresión no debe romper el flow del POS.
 */
export async function printKitchenTickets(
  printers: PrinterRecord[],
  input: KitchenTicketInput
): Promise<{ ok: number; failed: Array<{ name: string; error: string }> }> {
  const itemsWithGroups = input.items.filter(
    (it) => Array.isArray(it.printerGroupIds) && it.printerGroupIds.length > 0,
  );

  // Fallback legacy: ningún item asignado a Printer Groups → mandar
  // todo a KITCHEN+BAR como antes.
  if (itemsWithGroups.length === 0) {
    const payload = buildKitchenTicket(input);
    return dispatchToStations(printers, ["KITCHEN", "BAR"], payload);
  }

  // Mapa printerId → items[] que debe imprimir.
  const itemsByPrinter = new Map<string, TicketItem[]>();
  for (const item of input.items) {
    const groupIds = item.printerGroupIds ?? [];
    if (groupIds.length === 0) continue; // item sin ruta — se ignora con groups activos.

    // Resolver printers de cada group para este item, deduplicados.
    const seen = new Set<string>();
    for (const printer of printers) {
      if (!printer.isActive) continue;
      if (printer.connectionType !== "NETWORK") continue;
      if (!printer.ip || printer.ip === "0.0.0.0") continue;
      // El PrinterRecord debe traer una referencia a sus groups
      // (printerGroups[].printerGroup.id) — si el caller no la
      // proveyó, este printer no participa del enrutamiento por groups.
      const printerGroupIds = (printer as unknown as { printerGroupIds?: string[] }).printerGroupIds ?? [];
      if (printerGroupIds.length === 0) continue;
      if (printerGroupIds.some((gid) => groupIds.includes(gid))) {
        if (seen.has(printer.id)) continue;
        seen.add(printer.id);
        const arr = itemsByPrinter.get(printer.id) ?? [];
        arr.push(item);
        itemsByPrinter.set(printer.id, arr);
      }
    }
  }

  // Si la resolución por groups no encontró targets, fallback legacy.
  if (itemsByPrinter.size === 0) {
    const payload = buildKitchenTicket(input);
    return dispatchToStations(printers, ["KITCHEN", "BAR"], payload);
  }

  // Mandamos un ticket por printer con sus items asignados.
  let okTotal = 0;
  const failed: Array<{ name: string; error: string }> = [];

  await Promise.all(
    Array.from(itemsByPrinter.entries()).map(async ([printerId, items]) => {
      const printer = printers.find((p) => p.id === printerId);
      if (!printer) return;
      const payload = buildKitchenTicket({ ...input, items });
      try {
        await sendRawTcp({ ip: printer.ip as string, port: printer.port }, payload);
        okTotal += 1;
      } catch (e) {
        const err = e as { message?: string };
        failed.push({ name: printer.name, error: err?.message || "fallo TCP" });
      }
    }),
  );

  return { ok: okTotal, failed };
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

// ── Split por comensal (Fase 3) ─────────────────────────────────────────────

/**
 * Agrupa los items de una orden DINE_IN por seatNumber. Los items
 * `compartidos` (seatNumber null/undefined) se reparten en partes
 * iguales entre todos los comensales, prorrateando precio y cantidad
 * pero **conservando** la línea visible en el ticket de cada uno bajo
 * la etiqueta `(compartido x/N)` para que el cliente entienda por qué
 * paga una fracción.
 *
 * No genera nuevas órdenes en backend — el split aquí es puramente
 * para la impresión de N tickets visuales separados. El cobro real
 * sigue siendo una sola Order/PaymentTransaction (pendiente Fase 4
 * para multi-payment real).
 */
export interface SplitTicket {
  seatNumber: number;
  items: TicketItem[];
  subtotal: number;
}

export function splitItemsBySeat(
  items: TicketItem[],
  numberOfGuests: number
): SplitTicket[] {
  if (numberOfGuests < 1) return [];
  const seats: SplitTicket[] = Array.from({ length: numberOfGuests }, (_, i) => ({
    seatNumber: i + 1,
    items: [],
    subtotal: 0,
  }));

  // Items asignados a un seat específico.
  for (const it of items) {
    const seat = it.seatNumber;
    if (typeof seat === "number" && seat >= 1 && seat <= numberOfGuests) {
      const target = seats[seat - 1]!;
      target.items.push(it);
      target.subtotal += (it.price || 0) * (it.quantity || 0);
    }
  }

  // Items compartidos: prorrateo. La cantidad se queda fija (1 línea
  // visual por seat) y el precio se divide entre N. Ej: pizza $300
  // entre 4 → cada seat ve "1x Pizza (compartido) $75".
  const shared = items.filter((it) => it.seatNumber == null);
  for (const sh of shared) {
    const lineTotal = (sh.price || 0) * (sh.quantity || 0);
    const perSeat = lineTotal / numberOfGuests;
    seats.forEach((s) => {
      s.items.push({
        ...sh,
        name: sh.name + " (compartido)",
        // Precio prorrateado por seat; quantity 1 para que el ticket sea legible.
        price: perSeat,
        quantity: 1,
        seatNumber: s.seatNumber,
      });
      s.subtotal += perSeat;
    });
  }

  return seats;
}

/**
 * Imprime N tickets separados (uno por comensal) en impresoras CASHIER.
 * Cada ticket muestra el nombre del seat ("Comensal 2 de 4") y solo
 * los items que le tocan + su parte de los compartidos.
 *
 * El total final puede no cuadrar exactamente con `input.total` por
 * redondeo del prorrateo de compartidos; conservamos la suma exacta
 * de cada seat como su propio total y dejamos un footer con el
 * total general de la orden a modo de referencia.
 */
export async function printSplitReceipts(
  printers: PrinterRecord[],
  input: ReceiptInput,
  numberOfGuests: number
): Promise<{ ok: number; failed: Array<{ name: string; error: string }>; tickets: number }> {
  if (numberOfGuests < 2) {
    // No hay split — una sola impresión normal.
    const res = await printCustomerReceipt(printers, input);
    return { ...res, tickets: 1 };
  }

  const splits = splitItemsBySeat(input.items, numberOfGuests);

  let okTotal = 0;
  const failedAll: Array<{ name: string; error: string }> = [];
  let printed = 0;

  for (const seat of splits) {
    const seatInput: ReceiptInput = {
      ...input,
      items: seat.items,
      subtotal: seat.subtotal,
      total: seat.subtotal - (input.discount || 0) + (input.tax || 0) + (input.tip || 0),
      // El campo customerName se sobreescribe para distinguir al
      // imprimir; conserva el original como referencia.
      customerName: `Comensal ${seat.seatNumber} de ${numberOfGuests}`,
    };
    const res = await printCustomerReceipt(printers, seatInput);
    okTotal += res.ok;
    failedAll.push(...res.failed);
    if (res.ok > 0) printed += 1;
  }

  return { ok: okTotal, failed: failedAll, tickets: printed };
}

/**
 * FASE 12 · SPLIT EQUITATIVO
 *
 * Imprime N recibos en impresoras CASHIER, todos con la misma lista
 * completa de items pero con el total dividido en partes iguales y un
 * encabezado "Parte X de N" para que cada cliente sepa cuál es la suya.
 *
 * Útil cuando los comensales piden dividir la cuenta sin haber asignado
 * asientos individuales a los items (lo que llamarían "vamos a partes
 * iguales sin importar quién pidió qué").
 *
 * El subtotal/discount/tax/tip que muestra cada ticket también se
 * dividen para que la suma cuadre exactamente con el input original.
 * Si la división deja decimales fraccionarios (ej. $100/3 = 33.33...),
 * el redondeo standard de toFixed(2) es el que se imprime — la
 * diferencia residual se acumula en el último ticket para que la suma
 * de los N tickets sea exactamente igual al total de la orden.
 */
export async function printEqualSplitReceipts(
  printers: PrinterRecord[],
  input: ReceiptInput,
  parts: number
): Promise<{ ok: number; failed: Array<{ name: string; error: string }>; tickets: number }> {
  const safeParts = Math.max(1, Math.floor(parts || 1));

  if (safeParts === 1) {
    const res = await printCustomerReceipt(printers, input);
    return { ...res, tickets: 1 };
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const totalCents = Math.round((input.total || 0) * 100);
  const subtotalCents = Math.round((input.subtotal || 0) * 100);
  const discountCents = Math.round((input.discount || 0) * 100);
  const taxCents = Math.round((input.tax || 0) * 100);
  const tipCents = Math.round((input.tip || 0) * 100);

  // División entera por partes y guardado del residuo para sumar al
  // último ticket — así la suma de los N tickets coincide exactamente
  // con el total de la orden y el cajero no tiene que conciliar.
  const splitInt = (cents: number, idx: number) => {
    const base = Math.floor(cents / safeParts);
    const remainder = cents - base * safeParts;
    return idx === safeParts - 1 ? base + remainder : base;
  };

  let okTotal = 0;
  const failedAll: Array<{ name: string; error: string }> = [];
  let printed = 0;

  for (let i = 0; i < safeParts; i += 1) {
    const partInput: ReceiptInput = {
      ...input,
      // Mostramos los items completos para que el cliente vea la cuenta
      // total — la columna del precio sigue siendo el unitario real.
      items: input.items,
      subtotal: round2(splitInt(subtotalCents, i) / 100),
      discount: round2(splitInt(discountCents, i) / 100),
      tax: round2(splitInt(taxCents, i) / 100),
      tip: round2(splitInt(tipCents, i) / 100),
      total: round2(splitInt(totalCents, i) / 100),
      customerName: `Parte ${i + 1} de ${safeParts}`,
    };
    const res = await printCustomerReceipt(printers, partInput);
    okTotal += res.ok;
    failedAll.push(...res.failed);
    if (res.ok > 0) printed += 1;
  }

  return { ok: okTotal, failed: failedAll, tickets: printed };
}
