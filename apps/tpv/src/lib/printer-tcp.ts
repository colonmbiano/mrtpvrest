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
  // Doble golpe (ESC G) — refuerza el negro del texto ("líneas más negras")
  // sin agrandar el carácter. Se combina con BOLD para el modo "marcado".
  DBLSTRIKE_ON:  ESC + "G" + "\x01",
  DBLSTRIKE_OFF: ESC + "G" + "\x00",
  DOUBLE_ON:    GS  + "!" + "\x11",
  DOUBLE_OFF:   GS  + "!" + "\x00",
  // Tamaño triple (3x ancho, 3x alto). Algunas impresoras no soportan
  // más allá de DOUBLE — si no responde, el firmware lo ignora y queda igual.
  TRIPLE_ON:    GS  + "!" + "\x22",
  // Fuentes internas: A = estándar (12x24), B = compacta (9x17, más chars
  // por línea). ESC M n.
  FONT_A:       ESC + "M" + "\x00",
  FONT_B:       ESC + "M" + "\x01",
  // Interlineado. ESC 2 = default del firmware; ESC 3 n = n puntos.
  SPACING_TIGHT:  ESC + "3" + "\x12", // 18 dots
  SPACING_NORMAL: ESC + "2",
  SPACING_LOOSE:  ESC + "3" + "\x30", // 48 dots
  LF:           "\n",
  LINE:         "------------------------------\n",
  CUT:          GS  + "V" + "\x42" + "\x00",
};

// ── Resolución de tipografía (config admin → comandos ESC/POS) ────────────
//
// Compartido por recibo y comanda. La fuente B y el ancho de papel cambian
// cuántos caracteres caben por línea, lo que importa para alinear importes.

export type FontKey = "monospace" | "sans-serif" | "serif";
export type SizeKey = "small" | "medium" | "large" | "xlarge";
export type SpacingKey = "tight" | "normal" | "loose";
export type WeightKey = "light" | "normal" | "bold";

/** Caracteres por línea según fuente (A/B) y ancho de papel (58/80mm). */
export function lineWidthFor(fontFamily?: string | null, paperWidth?: string | null): number {
  const base = paperWidth === "58mm" ? 32 : 48; // Font A
  // sans-serif → Font B (compacta) ≈ +33% de caracteres.
  return fontFamily === "sans-serif" ? Math.round(base * 1.33) : base;
}

const fontCmd = (f?: string | null) => (f === "sans-serif" ? CMD.FONT_B : CMD.FONT_A);
const spacingCmd = (s?: string | null) =>
  s === "tight" ? CMD.SPACING_TIGHT : s === "loose" ? CMD.SPACING_LOOSE : CMD.SPACING_NORMAL;
// Tamaño = SOLO alto (nibble bajo de GS !), el ancho queda 1x para no romper
// la alineación por conteo de caracteres. "medium" (default histórico) y
// "small" quedan en 1x → no cambia el look actual; large=2x alto, xlarge=3x.
const sizeCmd = (s?: string | null) =>
  s === "xlarge" ? GS + "!" + "\x02" : s === "large" ? GS + "!" + "\x01" : GS + "!" + "\x00";

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

export function row(left: string, right: string, width: number = LINE_WIDTH): string {
  const max = width;
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

// ── Validación de IP ──────────────────────────────────────────────────────

/**
 * IPv4 estricta (4 octetos 0-255). Si al plugin TCP nativo le llega algo que
 * no es una IP numérica (un hostname, o una IP con espacios/typos), Android
 * intenta resolverlo por DNS y falla con el críptico "No address associated
 * with hostname". Validamos antes para dar un mensaje accionable.
 */
export function isValidIPv4(value: string): boolean {
  const m = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  return m.slice(1).every((octet) => Number(octet) <= 255);
}

/** Quita TODO el whitespace (no solo bordes) — registros viejos pudieron guardarse con espacios internos. */
export function sanitizeIp(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, "");
}

// ── Envío TCP ────────────────────────────────────────────────────────────

const DEFAULT_PORT = 9100;
const SOCKET_TIMEOUT_MS = 6000;

// Resiliencia de impresión (ver "comanda intermitente"):
//
// La impresión de PRUEBA siempre jala porque abre UNA conexión aislada y
// manual. La comanda en cambio se dispara por código vía Promise.all (varias
// impresoras KITCHEN/BAR) y puede solaparse con otra comanda/recibo. Las
// térmicas en el puerto 9100 (raw/JetDirect) aceptan UNA sola sesión TCP a la
// vez: una segunda conexión simultánea a la misma IP se rechaza o se queda
// colgada hasta el timeout de 6s → la comanda se pierde de forma intermitente.
// Además, un microcorte de Wi-Fi sin reintento = comanda perdida.
//
// Mitigación, contenida 100% aquí (no cambia call-sites ni UI):
//   1. MUTEX POR IP — serializamos los envíos a una misma impresora para que
//      nunca haya dos sockets abiertos a la vez. Impresoras DISTINTAS siguen
//      en paralelo (cada IP tiene su propia cola), preservando el Promise.all.
//   2. REINTENTOS con backoff — los fallos transitorios (printer ocupada por
//      el socket anterior, hipo de Wi-Fi) se reintentan en vez de perderse.
//   3. SETTLE tras desconectar — pausa breve antes de liberar la cola para
//      darle tiempo a la impresora de cerrar su sesión antes del siguiente job.
const PRINT_RETRIES = 3;
const RETRY_BACKOFF_MS = [200, 500];
const SETTLE_AFTER_PRINT_MS = 150;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Cola serializada por clave `ip:port`. Cada nuevo envío encadena tras el
// anterior (haya tenido éxito o no) para garantizar exclusión por impresora.
const ipLocks = new Map<string, Promise<void>>();

function withIpLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = ipLocks.get(key) ?? Promise.resolve();
  // `prev.then(fn, fn)` corre `fn` cuando el anterior termina, sin importar si
  // resolvió o rechazó (no queremos que un fallo previo rompa la cadena).
  const run = prev.then(fn, fn);
  // El tail almacenado nunca rechaza, así la cola sobrevive a errores.
  ipLocks.set(key, run.then(() => {}, () => {}));
  return run;
}

export interface PrintTarget {
  ip: string;
  port?: number | null;
}

// Un payload de impresión es texto (caso normal → se envía utf8, como siempre)
// o una lista de segmentos texto/binario (para incrustar bytes crudos como el
// raster del logo, que NO sobreviven a utf8/normalizeThermalText). Los arrays
// se serializan a HEX, que transporta los 256 valores de byte sin pérdida.
export type PrintPayload = string | Array<string | Uint8Array>;

/** Concatena segmentos a bytes: strings → ASCII (tras normalizar); Uint8Array tal cual. */
function segmentsToBytes(segments: Array<string | Uint8Array>): Uint8Array {
  const parts: number[] = [];
  for (const seg of segments) {
    if (typeof seg === "string") {
      const norm = normalizeThermalText(seg);
      for (let i = 0; i < norm.length; i += 1) parts.push(norm.charCodeAt(i) & 0xff);
    } else {
      for (let i = 0; i < seg.length; i += 1) parts.push(seg[i]);
    }
  }
  return Uint8Array.from(parts);
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

/** Un único intento de conexión + envío + desconexión. */
async function attemptSendRawTcp(
  plugin: TCPSocketPlugin,
  ip: string,
  port: number,
  payload: PrintPayload,
): Promise<void> {
  let clientId: number | null = null;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Timeout (6s) — impresora no responde")), SOCKET_TIMEOUT_MS)
  );

  try {
    const conn = await Promise.race([plugin.connect({ ipAddress: ip, port }), timeoutPromise]);
    clientId = conn.client;
    // Caso normal (string): ESC/POS de texto, todo ≤0x7F tras normalizar →
    // se envía utf8 como siempre. Caso binario (segmentos, p.ej. logo raster):
    // se serializa a HEX para no perder los bytes >0x7F.
    const send =
      typeof payload === "string"
        ? plugin.send({ client: clientId, data: normalizeThermalText(payload), encoding: "utf8" })
        : plugin.send({ client: clientId, data: bytesToHex(segmentsToBytes(payload)), encoding: "hex" });
    await Promise.race([send, timeoutPromise]);
  } finally {
    if (clientId !== null) {
      try { await plugin.disconnect({ client: clientId }); } catch { /* noop */ }
    }
  }
}

/**
 * Envía un payload ESC/POS al puerto raw de la impresora.
 * Resuelve cuando la escritura completa; rechaza con mensaje claro si
 * la conexión falla, hay timeout o el plugin no está disponible.
 *
 * Serializa por IP y reintenta para sobrevivir colisiones y transitorios
 * (ver nota de resiliencia arriba).
 */
export async function sendRawTcp(target: PrintTarget, payload: PrintPayload): Promise<void> {
  const ip = sanitizeIp(target.ip);
  const port = Number(target.port) || DEFAULT_PORT;
  if (!ip || ip === "0.0.0.0") {
    throw new Error("IP de impresora no configurada");
  }
  if (!isValidIPv4(ip)) {
    throw new Error(`IP de impresora invalida ("${ip}") — usa solo numeros y puntos, ej. 192.168.1.84`);
  }

  await ensurePlugin();
  const plugin = getPluginSync();
  if (!plugin) {
    throw new Error("Plugin TCP no disponible (corre el APK; en web usa el TPV nativo).");
  }

  return withIpLock(`${ip}:${port}`, async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < PRINT_RETRIES; attempt += 1) {
      try {
        await attemptSendRawTcp(plugin, ip, port, payload);
        // Settle: dale tiempo a la impresora de liberar su sesión TCP antes
        // de que el siguiente job en la cola intente conectarse.
        await delay(SETTLE_AFTER_PRINT_MS);
        return;
      } catch (e) {
        lastError = e;
        // No esperamos tras el último intento.
        if (attempt < PRINT_RETRIES - 1) {
          await delay(RETRY_BACKOFF_MS[attempt] ?? 500);
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Fallo de impresión TCP tras reintentos");
  });
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
  // En DINE_IN: a qué comensal pertenece. null = compartido.
  seatNumber?: number | null;
  // Printer Groups resueltos para este item — override item-level si
  // existe, default heredado de la categoría si no. El dispatcher usa
  // este array para enrutar la comanda a las impresoras correctas.
  printerGroupIds?: string[];
}

/**
 * Config aplicable al render de la comanda. Se carga desde
 * TicketConfig (locationId) y se pasa al builder. Cualquier campo
 * undefined cae al default — el builder funciona sin config en
 * absoluto, manteniendo compatibilidad con call-sites legacy.
 */
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
  // Tipografía de la comanda (espejo del recibo).
  fontFamily?: string | null;
  lineSpacing?: string | null;
  lineWeight?: string | null;
  paperWidth?: string | null;
  // Tamaño del nombre del ticket (Mesa/cliente) — elemento principal.
  ticketNameSize?: "normal" | "large" | "xlarge";
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
  /** Si true, marca el ticket como "ARTICULO ANULADO" — el/los items ya
   *  no van a prepararse (o hay que descartarlos si ya se hicieron). Tiene
   *  prioridad visual sobre isReprint. */
  isCancel?: boolean;
  /** Si true, marca el ticket como "PARCIAL" — se está reimprimiendo
   *  solo un subset de los items originales. */
  isPartial?: boolean;
  assignmentName?: string | null;
  /** Estado de pago para comandas web/delivery: imprime un banner visible
   *  "PAGADO" o "PENDIENTE DE PAGO" para que caja/cocina sepan si hay que
   *  cobrar. undefined = no mostrar nada (comportamiento histórico, p.ej.
   *  dine-in que se cobra al final). */
  paid?: boolean | null;
  /** Método de pago a mostrar bajo el banner (Efectivo/Transferencia/...). */
  paymentMethod?: string | null;
  /** Configuración admin para mostrar/ocultar campos y ajustar tamaño. */
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
  tax?: number | null;
  tip?: number | null;
  total: number;
  paymentMethod?: string | null;
  businessName?: string | null;
  businessFooter?: string | null;
  // Nuevos campos de configuración
  showLogo?: boolean;
  logoUrl?: string | null;
  showAddress?: boolean;
  address?: string | null;
  showPhone?: boolean;
  phone?: string | null;
  // ── Identidad de negocio extendida (encabezado fiscal) ──────────────────
  // Si el tenant aún no define estos campos, el builder los omite (no imprime
  // líneas vacías). Ver reporte "campos del tenant a agregar".
  businessType?: string | null;   // giro comercial (ej. "Restaurante")
  rfc?: string | null;            // RFC del emisor
  // ── Auditoría de caja ───────────────────────────────────────────────────
  cashierName?: string | null;    // cajero/empleado que cobró
  terminalName?: string | null;   // terminal/dispositivo
  // ── Lugar ───────────────────────────────────────────────────────────────
  numberOfGuests?: number | null; // para "Comensales: N" cuando no hay mesa
  // ── Bloque de factura (QR) ──────────────────────────────────────────────
  showInvoiceQr?: boolean;
  invoiceUrl?: string | null;     // destino del QR (ej. facturacion.masterburguers.com)
  invoiceFolio?: string | null;   // folio fiscal (ej. MB-00123)
  // ── Propina sugerida (informativa, típico dine-in) ──────────────────────
  suggestedTipPercents?: number[];
  // Tipografía (config admin). fontFamily decide Font A/B; fontSize el alto;
  // lineSpacing el interlineado; lineWeight qué tan marcadas las líneas.
  fontFamily?: string | null;
  fontSize?: string | null;
  lineSpacing?: string | null;
  lineWeight?: string | null;
  paperWidth?: string | null;
}

const fmtMoney = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

const ORDER_TYPE_LABEL: Record<string, string> = {
  DINE_IN:  "Comer aquí",
  TAKEOUT:  "Para llevar",
  DELIVERY: "A domicilio",
};

// Método de pago → español. Mapa explícito (no hardcode en el render) para que
// agregar un método nuevo sea una sola línea. Cubre todo el enum PaymentMethod.
const PAYMENT_LABEL: Record<string, string> = {
  CASH:             "EFECTIVO",
  CASH_ON_DELIVERY: "EFECTIVO",
  CARD:             "TARJETA",
  CARD_PRESENT:     "TARJETA",
  TRANSFER:         "TRANSFERENCIA",
  SPEI:             "TRANSFERENCIA",
  OXXO:             "OXXO",
  COURTESY:         "CORTESIA",
  PENDING:          "PENDIENTE",
};

/** Traduce el método de pago a español; desconocido → se muestra tal cual (upper). */
export function paymentLabel(method?: string | null): string {
  if (!method) return "";
  const key = String(method).toUpperCase();
  return PAYMENT_LABEL[key] ?? key;
}

/**
 * Antepone una etiqueta SÓLO si el valor no la trae ya, evitando duplicados
 * tipo "Mesa Mesa 12". `withLabel("Mesa", "Mesa 12") → "Mesa 12"`;
 * `withLabel("Mesa", "12") → "Mesa 12"`.
 */
export function withLabel(label: string, value: string): string {
  const v = String(value ?? "").trim();
  if (!v) return label;
  return new RegExp(`^${label}\\b`, "i").test(v) ? v : `${label} ${v}`;
}

/**
 * Renderiza una línea de producto: `Nx Nombre .......  $importe`. Si el nombre
 * no cabe, lo envuelve a líneas siguientes con sangría (en vez de truncar con
 * "..."), para no perder información. El importe va sólo en la primera línea.
 */
export function formatProductLine(
  quantity: number,
  name: string,
  amount: string,
  width: number,
  indent = "   ",
): string {
  const prefix = `${quantity}x `;
  const firstNameMax = Math.max(1, width - amount.length - 1 - prefix.length);
  const contMax = Math.max(1, width - indent.length);

  const lines: string[] = [];
  let cur = "";
  let max = firstNameMax;
  const flush = () => { lines.push(cur); cur = ""; max = contMax; };
  for (let word of String(name ?? "").split(/\s+/).filter(Boolean)) {
    // Palabra más larga que el ancho disponible → corte duro.
    while (word.length > max) {
      if (cur) flush();
      lines.push(word.slice(0, max));
      word = word.slice(max);
      max = contMax;
    }
    const cand = cur ? `${cur} ${word}` : word;
    if (cand.length > max && cur) { flush(); cur = word; }
    else cur = cand;
  }
  if (cur) lines.push(cur);
  if (lines.length === 0) lines.push("");

  let out = row(prefix + lines[0], amount, width);
  for (let i = 1; i < lines.length; i += 1) out += indent + lines[i] + "\n";
  return out;
}

/**
 * Bloque ESC/POS para imprimir un QR (modelo 2). Lo soportan la mayoría de
 * térmicas modernas (Epson y compatibles, incl. las del puerto 9100). Si el
 * firmware no lo entiende, ignora los comandos y el resto del ticket sale igual.
 * Todos los bytes son ≤ 0x7F, así que sobreviven a normalizeThermalText().
 */
export function qrCode(data: string, moduleSize = 6): string {
  const c = (n: number) => String.fromCharCode(n);
  const payload = String(data ?? "");
  const len = payload.length + 3;
  const pL = len & 0xff;
  const pH = (len >> 8) & 0xff;
  const size = Math.min(15, Math.max(1, moduleSize));
  return (
    // Modelo 2
    GS + "(k" + c(4) + c(0) + c(49) + c(65) + c(50) + c(0) +
    // Tamaño de módulo
    GS + "(k" + c(3) + c(0) + c(49) + c(67) + c(size) +
    // Nivel de corrección de errores = M
    GS + "(k" + c(3) + c(0) + c(49) + c(69) + c(48) +
    // Cargar datos en el símbolo
    GS + "(k" + c(pL) + c(pH) + c(49) + c(80) + c(48) + payload +
    // Imprimir el símbolo
    GS + "(k" + c(3) + c(0) + c(49) + c(81) + c(48)
  );
}

// ── Builders ──────────────────────────────────────────────────────────────

export function buildKitchenTicket(input: KitchenTicketInput): string {
  const time = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  // Defaults — equivalentes al comportamiento previo a la introducción del
  // config admin, para que call-sites sin config sigan funcionando igual.
  const cfg: Required<KitchenTicketConfig> = {
    header:           input.config?.header           ?? "",
    footer:           input.config?.footer           ?? "",
    showOrderNumber:  input.config?.showOrderNumber  ?? true,
    showTime:         input.config?.showTime         ?? true,
    showOrderType:    input.config?.showOrderType    ?? true,
    showTableNumber:  input.config?.showTableNumber  ?? true,
    showCustomerName: input.config?.showCustomerName ?? true,
    showModifiers:    input.config?.showModifiers    ?? true,
    showNotes:        input.config?.showNotes        ?? true,
    groupBySeat:      input.config?.groupBySeat      ?? true,
    separateByGroup:  input.config?.separateByGroup  ?? false,
    fontSize:         input.config?.fontSize         ?? "large",
    fontFamily:       input.config?.fontFamily       ?? "monospace",
    lineSpacing:      input.config?.lineSpacing      ?? "normal",
    lineWeight:       input.config?.lineWeight       ?? "bold",
    paperWidth:       input.config?.paperWidth       ?? "80mm",
    ticketNameSize:   input.config?.ticketNameSize   ?? "large",
  };

  // Resolución del tamaño de fuente para items. "normal" = ancho normal,
  // "large" = doble (default histórico), "xlarge" = triple. Si el firmware
  // de la impresora no soporta el comando, queda en el tamaño anterior.
  const itemSizeOn =
    cfg.fontSize === "normal" ? "" :
    cfg.fontSize === "xlarge" ? CMD.TRIPLE_ON : CMD.DOUBLE_ON;
  const itemSizeOff = cfg.fontSize === "normal" ? "" : CMD.DOUBLE_OFF;

  // Peso de las líneas. light = sin forzar negrita; bold = negrita + doble
  // golpe (más negras). El tamaño de los items se mantiene aparte (itemSize).
  const heavy = cfg.lineWeight === "bold";
  const light = cfg.lineWeight === "light";
  const itemBoldOn = light ? "" : CMD.BOLD_ON;
  const itemBoldOff = light ? "" : CMD.BOLD_OFF;

  let d =
    CMD.INIT +
    fontCmd(cfg.fontFamily) +
    spacingCmd(cfg.lineSpacing) +
    (heavy ? CMD.DBLSTRIKE_ON : "") +
    CMD.ALIGN_CENTER;

  // Banner de anulación — máxima prioridad. Avisa a cocina que el/los
  // items ya NO van (cancelados). Doble ancho + negritas para que no se
  // confunda con una comanda normal.
  if (input.isCancel) {
    d += CMD.BOLD_ON + CMD.DOUBLE_ON;
    d += "*** ARTICULO ANULADO ***\n";
    d += "*** NO PREPARAR ***\n";
    d += CMD.DOUBLE_OFF + CMD.BOLD_OFF;
    d += CMD.LINE;
  }

  // Banner de reimpresión — bien visible para que el cocinero NO prepare
  // los items dos veces. Va antes del header normal y usa el modo doble
  // ancho para asegurar legibilidad incluso en quemadores con poco contraste.
  if (input.isReprint && !input.isCancel) {
    d += CMD.BOLD_ON + CMD.DOUBLE_ON;
    d += "*** REIMPRESION ***\n";
    d += CMD.DOUBLE_OFF + CMD.BOLD_OFF;
    if (input.isPartial) {
      d += CMD.BOLD_ON + "(parcial)\n" + CMD.BOLD_OFF;
    }
    d += CMD.LINE;
  }

  // TÍTULO de la comanda = nombre del ticket (Mesa / cliente): grande y hasta
  // arriba para que cocina identifique la cuenta de un vistazo. Reemplaza al
  // antiguo título fijo "COMANDA" (en cocina ya saben que es una comanda).
  const nameSizeOn =
    cfg.ticketNameSize === "normal" ? "" :
    cfg.ticketNameSize === "xlarge" ? CMD.TRIPLE_ON : CMD.DOUBLE_ON;
  const nameSizeOff = cfg.ticketNameSize === "normal" ? "" : CMD.DOUBLE_OFF;
  if (cfg.showTableNumber && input.tableNumber) {
    d += nameSizeOn + CMD.BOLD_ON + withLabel("Mesa", String(input.tableNumber)) + "\n" + CMD.BOLD_OFF + nameSizeOff;
  }
  if (cfg.showCustomerName && input.customerName) {
    d += nameSizeOn + CMD.BOLD_ON + input.customerName + "\n" + CMD.BOLD_OFF + nameSizeOff;
  }

  // Estación destino (separateByGroup): a qué printer-group va esta comanda.
  if (input.assignmentName?.trim()) {
    d += CMD.BOLD_ON + CMD.DOUBLE_ON;
    d += input.assignmentName.trim().toUpperCase() + "\n";
    d += CMD.DOUBLE_OFF + CMD.BOLD_OFF;
  }

  // Encabezado OPCIONAL (vacío por defecto). Ya no es "COMANDA" fijo; queda
  // como texto extra configurable (Tickets → Cocina) por si el negocio quiere
  // un rótulo propio. Va debajo del nombre para no robarle protagonismo.
  if (cfg.header.trim()) {
    d += CMD.BOLD_ON + cfg.header.trim() + "\n" + CMD.BOLD_OFF;
  }

  if (cfg.showOrderNumber && input.orderNumber) d += "#" + input.orderNumber + "\n";
  if (cfg.showTime) d += time + "\n";
  if (cfg.showOrderType && input.orderType) {
    d += (ORDER_TYPE_LABEL[input.orderType] || input.orderType) + "\n";
  }

  // Banner de estado de pago (pedidos web/delivery). Doble ancho para que se
  // vea de un golpe: PAGADO = no cobrar; PENDIENTE = hay que cobrar al entregar.
  if (input.paid === true || input.paid === false) {
    d += CMD.BOLD_ON + CMD.DOUBLE_ON;
    d += (input.paid ? "** PAGADO **" : "** PENDIENTE DE PAGO **") + "\n";
    d += CMD.DOUBLE_OFF + CMD.BOLD_OFF;
    if (input.paymentMethod) {
      d += paymentLabel(input.paymentMethod) + "\n";
    }
  }

  d += CMD.LINE;
  d += CMD.ALIGN_LEFT;

  // Para DINE_IN agrupamos por comensal cuando hay items repartidos entre
  // 2+ buckets (seat numerado o compartido) Y el toggle groupBySeat está
  // activo. Para TAKEOUT/DELIVERY o cuando todo cae en un solo bucket,
  // se mantiene la salida plana.
  const isDineIn = input.orderType === "DINE_IN";
  const seatBuckets = new Map<number | "shared", TicketItem[]>();
  if (isDineIn && cfg.groupBySeat) {
    for (const it of input.items) {
      const key: number | "shared" =
        typeof it.seatNumber === "number" ? it.seatNumber : "shared";
      const arr = seatBuckets.get(key) ?? [];
      arr.push(it);
      seatBuckets.set(key, arr);
    }
  }
  const shouldGroupBySeat = isDineIn && cfg.groupBySeat && seatBuckets.size >= 2;

  const renderItem = (item: TicketItem) => {
    let s = itemSizeOn + itemBoldOn;
    s += `${item.quantity}x ${item.name}\n`;
    if (cfg.showModifiers && item.modifiers && item.modifiers.length > 0) {
      s += itemSizeOff;
      for (const m of item.modifiers) s += `  + ${m.name}\n`;
      s += itemSizeOn;
    }
    if (cfg.showNotes && item.notes && item.notes.trim()) {
      s += itemSizeOff;
      s += `  > ${item.notes}\n`;
      s += itemSizeOn;
    }
    s += itemSizeOff + itemBoldOff;
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

  d += CMD.LINE;
  if (cfg.footer.trim()) {
    d += CMD.ALIGN_CENTER + cfg.footer.trim() + "\n" + CMD.ALIGN_LEFT;
  }
  d += (heavy ? CMD.DBLSTRIKE_OFF : "") + CMD.LF + CMD.LF + CMD.CUT;
  return d;
}

// IVA estándar MX (16%), modelo "IVA incluido": el precio que ve el cliente ya
// trae el impuesto, así que el subtotal sin IVA se DESGLOSA del total
// (subtotal = total / 1.16; iva = total − subtotal). Centralizado para que
// recibo y pantalla del TPV usen la misma aritmética.
const IVA_RATE = 0.16;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function ivaBreakdown(total: number, rate = IVA_RATE): { subtotal: number; iva: number } {
  const base = round2(total / (1 + rate));
  return { subtotal: base, iva: round2(total - base) };
}

// ── Logo (raster ESC/POS) ──────────────────────────────────────────────────
//
// El logo son bytes binarios (0x00–0xFF) que NO sobreviven al envío utf8 ni a
// normalizeThermalText. El builder (síncrono y puro) solo deja un MARKER donde
// va el logo; el orquestador async genera el raster, parte el texto en el marker
// e inyecta los bytes como segmentos (ver injectLogo + PrintPayload).
const LOGO_MARKER = "\x1F\x1FLOGO\x1F\x1F";

/** Ancho del cabezal en puntos según el papel (58mm≈384, 80mm≈512). */
function dotWidthFor(paperWidth?: string | null): number {
  return paperWidth === "58mm" ? 384 : 512;
}

/**
 * Empaqueta un bitmap monocromo (1 = punto negro, fila por fila, length
 * width*height) en el comando ESC/POS GS v 0 (raster bit image). El ancho se
 * agrupa en bytes (8 puntos/byte, MSB primero). Función PURA → testeable sin
 * canvas ni impresora.
 */
export function packRaster(mono: Uint8Array | number[], width: number, height: number): Uint8Array {
  const widthBytes = Math.ceil(width / 8);
  const out = new Uint8Array(8 + widthBytes * height);
  out[0] = 0x1d; out[1] = 0x76; out[2] = 0x30; out[3] = 0x00; // GS v 0 m=0
  out[4] = widthBytes & 0xff; out[5] = (widthBytes >> 8) & 0xff; // xL xH (bytes)
  out[6] = height & 0xff;     out[7] = (height >> 8) & 0xff;     // yL yH (dots)
  let p = 8;
  for (let y = 0; y < height; y += 1) {
    for (let bx = 0; bx < widthBytes; bx += 1) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const x = bx * 8 + bit;
        if (x < width && mono[y * width + x]) byte |= 1 << (7 - bit);
      }
      out[p] = byte;
      p += 1;
    }
  }
  return out;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // necesario para getImageData sin tainted canvas
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("logo: no se pudo cargar la imagen"));
    img.src = url;
  });
}

/**
 * Descarga el logo, lo escala al ancho del papel, lo umbraliza a 1 bit y lo
 * empaqueta como raster ESC/POS. Browser-only (usa canvas). Devuelve null y
 * NO lanza si algo falla (SSR, CORS/tainted, formato) — el recibo se imprime
 * igual sin logo.
 */
export async function renderLogoEscPos(
  url: string,
  targetWidth: number,
  threshold = 160,
): Promise<Uint8Array | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") return null;
  try {
    const img = await loadImage(url);
    const srcW = img.width || targetWidth;
    const srcH = img.height || targetWidth;
    const w = Math.min(targetWidth, 512);
    const h = Math.max(1, Math.round((srcH / srcW) * w));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const mono = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i += 1) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
      // Píxel transparente → blanco; si no, luminancia. Por debajo del umbral = negro.
      const lum = a < 128 ? 255 : 0.299 * r + 0.587 * g + 0.114 * b;
      mono[i] = lum < threshold ? 1 : 0;
    }
    return packRaster(mono, w, h);
  } catch {
    return null;
  }
}

/**
 * Resuelve el marker del logo en el texto del recibo: si hay logo configurado
 * y se pudo rasterizar, parte el texto y devuelve segmentos [pre, bytes, post];
 * si no, simplemente elimina el marker y devuelve el string (impresión normal).
 */
async function injectLogo(text: string, input: ReceiptInput): Promise<PrintPayload> {
  if (!text.includes(LOGO_MARKER)) return text;
  if (!(input.showLogo && input.logoUrl)) return text.split(LOGO_MARKER).join("");
  const logo = await renderLogoEscPos(input.logoUrl, dotWidthFor(input.paperWidth));
  if (!logo) return text.split(LOGO_MARKER).join(""); // fallback: sin logo
  const idx = text.indexOf(LOGO_MARKER);
  return [text.slice(0, idx), logo, text.slice(idx + LOGO_MARKER.length)];
}

export function buildCustomerReceipt(input: ReceiptInput): string {
  const now = new Date().toLocaleString("es-MX");
  // Tipografía configurable (admin). lw = ancho real en caracteres según
  // fuente/papel; heavy/light controlan qué tan marcadas van las líneas.
  const lw = lineWidthFor(input.fontFamily, input.paperWidth);
  const sep = "-".repeat(lw) + "\n"; // separador al ancho REAL del papel
  const heavy = input.lineWeight === "bold";
  const light = input.lineWeight === "light";
  const boldOn = light ? "" : CMD.BOLD_ON;
  const boldOff = light ? "" : CMD.BOLD_OFF;

  let d =
    CMD.INIT +
    fontCmd(input.fontFamily) +
    spacingCmd(input.lineSpacing) +
    sizeCmd(input.fontSize) +
    (heavy ? CMD.BOLD_ON + CMD.DBLSTRIKE_ON : "") +
    CMD.ALIGN_CENTER;

  // LOGO — el builder es puro/síncrono, así que solo deja un marker centrado.
  // printCustomerReceipt (async) lo reemplaza por el raster real (o lo elimina
  // si no hay logo / falla la carga). Ver injectLogo + renderLogoEscPos.
  if (input.showLogo && input.logoUrl) {
    d += LOGO_MARKER + "\n";
  }

  // ── 1. ENCABEZADO DE NEGOCIO (del tenant, sin hardcode) ──────────────────
  if (input.businessName) {
    d += CMD.BOLD_ON + CMD.DOUBLE_ON + input.businessName + "\n" + CMD.DOUBLE_OFF + CMD.BOLD_OFF;
  }
  if (input.businessType) d += input.businessType + "\n";
  if (input.showAddress !== false && input.address) d += input.address + "\n";
  if (input.showPhone !== false && input.phone) d += "Tel: " + input.phone + "\n";
  if (input.rfc) d += "RFC: " + input.rfc + "\n";

  d += sep + CMD.ALIGN_LEFT;

  // ── 2. META (ticket, tipo, lugar, fecha, cajero, terminal) ───────────────
  if (input.orderNumber) d += row("Ticket:", "#" + input.orderNumber, lw);
  if (input.orderType) {
    d += row("Tipo:", ORDER_TYPE_LABEL[input.orderType] || String(input.orderType), lw);
  }
  // Lugar: Mesa N (sin duplicar el label) o, si no hay mesa, Comensales: N.
  if (input.tableNumber) {
    d += row("Lugar:", withLabel("Mesa", String(input.tableNumber)), lw);
  } else if (input.numberOfGuests && input.numberOfGuests > 0) {
    d += row("Comensales:", String(input.numberOfGuests), lw);
  }
  if (input.customerName) d += row("Cliente:", input.customerName, lw);
  d += row("Fecha:", now, lw);
  if (input.cashierName) d += row("Cajero:", input.cashierName, lw);
  if (input.terminalName) d += row("Terminal:", input.terminalName, lw);

  d += sep;

  // ── 3. LÍNEAS DE PRODUCTO (wrap, no truncado; modificadores con sangría) ──
  for (const item of input.items) {
    const lineTotal =
      item.price * item.quantity +
      (item.modifiers || []).reduce((s, m) => s + (m.priceAdd || 0), 0) * item.quantity;
    d += formatProductLine(item.quantity, item.name, fmtMoney(lineTotal), lw);
    for (const m of item.modifiers || []) {
      // Subline con sangría: "+ Nombre        +monto" alineado a la derecha.
      const right = m.priceAdd ? "+" + fmtMoney(m.priceAdd) : "";
      d += row("  + " + m.name, right, lw);
    }
  }

  d += sep;

  // ── 4. TOTALES (IVA incluido: subtotal/iva se desglosan del total) ───────
  if (input.discount && input.discount > 0) {
    d += row("Descuento:", "-" + fmtMoney(input.discount), lw);
  }
  const { subtotal: subSinIva, iva } = ivaBreakdown(input.total);
  d += row("Subtotal:", fmtMoney(subSinIva), lw);
  d += row("IVA (16% incl.):", fmtMoney(iva), lw);
  if (input.tip && input.tip > 0) d += row("Propina:", fmtMoney(input.tip), lw);
  d += boldOn + CMD.DOUBLE_ON + row("TOTAL:", fmtMoney(input.total), lw) + CMD.DOUBLE_OFF + boldOff;

  d += sep;

  // ── 5. PAGO (método traducido) + propina sugerida (informativa) ──────────
  if (input.paymentMethod) {
    d += row("Pago:", paymentLabel(input.paymentMethod), lw);
  }
  const tipPcts = input.suggestedTipPercents
    ?? (input.orderType === "DINE_IN" ? [10] : []);
  if (tipPcts.length > 0) {
    d += "\n" + CMD.ALIGN_CENTER + "Propina sugerida\n" + CMD.ALIGN_LEFT;
    const { subtotal: baseForTip } = ivaBreakdown(input.total);
    for (const pct of tipPcts) {
      d += row(`  ${pct}%`, fmtMoney(round2(baseForTip * (pct / 100))), lw);
    }
  }

  // ── 6. BLOQUE DE FACTURA (QR) ────────────────────────────────────────────
  if (input.showInvoiceQr && input.invoiceUrl) {
    d += sep + CMD.ALIGN_CENTER;
    d += boldOn + "¿Quieres tu factura?\n" + boldOff;
    d += qrCode(input.invoiceUrl) + "\n";
    if (input.invoiceFolio) d += "Folio: " + input.invoiceFolio + "\n";
    d += CMD.ALIGN_LEFT;
  }

  // ── 7. PIE ───────────────────────────────────────────────────────────────
  d += CMD.ALIGN_CENTER + CMD.LF;
  if (input.businessFooter) {
    d += input.businessFooter + "\n";
  } else {
    d += "¡Gracias por tu compra!\n";
    d += "Te esperamos pronto\n";
  }

  d += (heavy ? CMD.DBLSTRIKE_OFF + CMD.BOLD_OFF : "") + CMD.LF + CMD.LF + CMD.CUT;
  return d;
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
  payload: PrintPayload
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

  if (targets.length === 0) {
    return {
      ok: 0,
      failed: [{
        name: "Impresoras",
        error: `No hay impresoras ${stations.join("/")} activas con IP configurada`,
      }],
    };
  }

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

// Pulso de apertura de cajón (ESC p m t1 t2). El cajón monedero va conectado
// al puerto RJ11 de la impresora de mostrador, así que el pulso se manda a la
// impresora CASHIER. Mantenemos t1/t2 ≤ 0x7F porque normalizeThermalText()
// descarta cualquier byte > 0x7F (se envía como utf8) — un 0xFA típico se
// borraría y corrompería el comando. Disparamos pin 0 y pin 1 para cubrir
// ambos cableados de cajón comunes (pin 2 / pin 5).
const DRAWER_KICK =
  ESC + "p" + "\x00" + "\x19" + "\x78" + ESC + "p" + "\x01" + "\x19" + "\x78";

/**
 * Abre el cajón monedero enviando el pulso ESC/POS a las impresoras CASHIER
 * activas. No lanza; devuelve el mismo conteo ok/failed que dispatchToStations
 * (failed con el motivo cuando no hay impresora CASHIER con IP configurada).
 */
export async function openCashDrawer(
  printers: PrinterRecord[],
): Promise<{ ok: number; failed: Array<{ name: string; error: string }> }> {
  return dispatchToStations(printers, ["CASHIER"], DRAWER_KICK);
}

/**
 * Imprime comandas en cocina (KITCHEN + BAR).
 *
 * Algoritmo de enrutamiento:
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
  if (input.config?.separateByGroup) {
    const jobs = new Map<
      string,
      { printer: PrinterRecord; assignmentName: string; items: TicketItem[] }
    >();

    for (const item of input.items) {
      const groupIds = item.printerGroupIds ?? [];
      for (const printer of printers) {
        if (
          !printer.isActive ||
          printer.connectionType !== "NETWORK" ||
          !printer.ip ||
          printer.ip === "0.0.0.0"
        ) {
          continue;
        }
        for (const group of printer.printerGroupRefs ?? []) {
          if (!groupIds.includes(group.id)) continue;
          const key = `${printer.id}:${group.id}`;
          const job = jobs.get(key) ?? {
            printer,
            assignmentName: group.name,
            items: [],
          };
          job.items.push(item);
          jobs.set(key, job);
        }
      }
    }

    if (jobs.size > 0) {
      let okTotal = 0;
      const failed: Array<{ name: string; error: string }> = [];
      await Promise.all(
        Array.from(jobs.values()).map(async ({ printer, assignmentName, items }) => {
          const payload = buildKitchenTicket({ ...input, items, assignmentName });
          try {
            await sendRawTcp({ ip: printer.ip as string, port: printer.port }, payload);
            okTotal += 1;
          } catch (e) {
            const err = e as { message?: string };
            failed.push({
              name: `${printer.name} - ${assignmentName}`,
              error: err?.message || "fallo TCP",
            });
          }
        }),
      );
      return { ok: okTotal, failed };
    }
  }

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
  const text = buildCustomerReceipt(input);
  const payload = await injectLogo(text, input);
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

  // Total de una línea INCLUYENDO modificadores con precio (misma regla que
  // el resto del sistema; antes el prorrateo omitía el priceAdd y la suma de
  // los tickets por comensal no cuadraba con el total de la orden).
  const lineTotalOf = (it: TicketItem) =>
    (it.price || 0) * (it.quantity || 0) +
    (it.modifiers || []).reduce((s, m) => s + (m.priceAdd || 0), 0) * (it.quantity || 0);

  // Items asignados a un seat específico.
  for (const it of items) {
    const seat = it.seatNumber;
    if (typeof seat === "number" && seat >= 1 && seat <= numberOfGuests) {
      const target = seats[seat - 1]!;
      target.items.push(it);
      target.subtotal += lineTotalOf(it);
    }
  }

  // Items compartidos: prorrateo. La cantidad se queda fija (1 línea
  // visual por seat) y el total (con modificadores) se divide entre N. Ej:
  // pizza $300 entre 4 → cada seat ve "1x Pizza (compartido) $75". Se limpian
  // los modificadores del clon porque su precio YA quedó dentro de `price`
  // (perSeat) — si no, el render los volvería a sumar (doble conteo).
  const shared = items.filter((it) => it.seatNumber == null);
  for (const sh of shared) {
    const perSeat = lineTotalOf(sh) / numberOfGuests;
    seats.forEach((s) => {
      s.items.push({
        ...sh,
        name: sh.name + " (compartido)",
        price: perSeat,
        quantity: 1,
        modifiers: [],
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
