// Impresión térmica ESC/POS de MRTPV Retail (recibo 80mm + etiqueta de SKU con código
// de barras CODE128). Despacha por plataforma:
//   · Windows (Tauri) → comando Rust `print_escpos` (TCP puerto 9100).
//   · Android (Capacitor) → plugin capacitor-tcp-socket (TCP 9100).
//   · Web/dev → no hay socket TCP; el caller cae a window.print() de la vista.
// Mismo enfoque que el TPV (apps/tpv/src/lib/printer-tcp.ts).

const ESC = "\x1B";
const GS = "\x1D";

const CMD = {
  INIT: ESC + "@",
  ALIGN_L: ESC + "a" + "\x00",
  ALIGN_C: ESC + "a" + "\x01",
  BOLD_ON: ESC + "E" + "\x01",
  BOLD_OFF: ESC + "E" + "\x00",
  BIG: GS + "!" + "\x11", // doble alto+ancho
  NORMAL: GS + "!" + "\x00",
  CUT: GS + "V" + "\x42" + "\x00", // corte parcial con avance
  feed: (n: number) => ESC + "d" + String.fromCharCode(Math.max(0, Math.min(255, n))),
};

// CODE128 nativo de la impresora: GS k 73 n {B<datos}. Altura GS h, ancho GS w,
// HRI (texto bajo el código) apagado con GS H 0 (lo imprimimos nosotros).
function code128(data: string): string {
  const payload = "{B" + data;
  return (
    GS + "h" + "\x50" + // altura 80 dots
    GS + "w" + "\x02" + // ancho módulo 2
    GS + "H" + "\x00" + // sin HRI
    GS + "k" + "\x49" + String.fromCharCode(payload.length) + payload
  );
}

// Las térmicas no rinden acentos en la página de códigos por defecto → los quito.
function ascii(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x00-\x7F]/g, "");
}

const money = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

// Renglón izquierda/derecha ajustado al ancho (80mm Font A = 48 cols).
function row(left: string, right: string, width = 48): string {
  left = ascii(left);
  right = ascii(right);
  const space = Math.max(1, width - left.length - right.length);
  if (left.length + right.length >= width) {
    return left.slice(0, width - right.length - 1) + " " + right + "\n";
  }
  return left + " ".repeat(space) + right + "\n";
}

const sep = (width = 48) => "-".repeat(width) + "\n";

export interface ReceiptInput {
  folio: string;
  items: { name: string; qty: number; price: number; color?: string; size?: string }[];
  subtotal: number;
  desc?: number;
  total: number;
  method?: string;
  cashier?: string;
}

export interface PrinterConfig {
  ip: string;
  port: number;
  storeName: string;
  address: string;
  rfcTel: string;
}

export function getPrinterConfig(): PrinterConfig {
  const g = (k: string, d = "") =>
    (typeof window !== "undefined" && window.localStorage.getItem(k)) || d;
  return {
    ip: g("moda-printer-ip"),
    port: Number(g("moda-printer-port", "9100")) || 9100,
    storeName: g("moda-store-name", "MODA+"),
    address: g("moda-store-address", "Av. Masaryk 100, Polanco"),
    rfcTel: g("moda-store-rfctel", "RFC MPL230114AB1 · Tel 55 1234 0000"),
  };
}

export function setPrinterIp(ip: string, port?: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("moda-printer-ip", ip.trim());
  if (port) window.localStorage.setItem("moda-printer-port", String(port));
}

export function buildReceipt(sale: ReceiptInput, cfg = getPrinterConfig()): string {
  // IVA desglosado COMO INCLUIDO en el total (el precio de catálogo ya lo trae); informativo.
  const iva = Math.round((sale.total - sale.total / 1.16) * 100) / 100;
  const now = new Date().toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
  let r = CMD.INIT + CMD.ALIGN_C;
  r += CMD.BOLD_ON + CMD.BIG + ascii(cfg.storeName) + "\n" + CMD.NORMAL + CMD.BOLD_OFF;
  r += "SMART RETAIL FLOW\n";
  r += ascii(cfg.address) + "\n" + ascii(cfg.rfcTel) + "\n";
  r += CMD.ALIGN_L + sep();
  r += row("Folio", sale.folio) + row("Cajero", sale.cashier || "-") + row("Fecha", now);
  r += sep();
  for (const it of sale.items) {
    r += ascii(it.name) + "\n";
    const variant = [it.color, it.size].filter(Boolean).join("/");
    r += row(`${it.qty} x ${money(it.price)}${variant ? " " + variant : ""}`, money(it.price * it.qty));
  }
  r += sep();
  r += row("Subtotal", money(sale.subtotal));
  if (sale.desc) r += row("Descuento", "-" + money(sale.desc));
  r += CMD.BOLD_ON + CMD.BIG + row("TOTAL", money(sale.total), 24) + CMD.NORMAL + CMD.BOLD_OFF;
  r += row("IVA 16% incluido", money(iva));
  r += row(sale.method || "Efectivo", money(sale.total));
  r += sep();
  r += CMD.ALIGN_C + code128(sale.folio) + "\n" + sale.folio + "\n\n";
  r += "Gracias por tu compra\nCambios en 30 dias con ticket\n";
  r += CMD.feed(4) + CMD.CUT;
  return r;
}

export interface LabelInput {
  name: string;
  /** Atributos ya resueltos por el giro y en su orden ("Acero · 1/2\""). La
   *  etiqueta no sabe de talla ni color: el llamador decide qué imprimir. */
  attrs?: (string | null | undefined)[];
  /** Unidad de venta (PZA|MTS|KG|LTS|CAJA). Se omite en PZA por ser el default. */
  unit?: string | null;
  price: number;
  code: string;
  sku: string;
}

export function buildLabel(label: LabelInput, copies = 1, cfg = getPrinterConfig()): string {
  let r = "";
  const variant = (label.attrs || []).filter(Boolean).join(" / ");
  const priceLine = label.unit && label.unit !== "PZA"
    ? `${money(label.price)} / ${label.unit}`
    : money(label.price);
  for (let i = 0; i < Math.max(1, copies); i++) {
    r += CMD.INIT + CMD.ALIGN_C;
    r += CMD.BOLD_ON + ascii(cfg.storeName) + CMD.BOLD_OFF + "\n";
    r += ascii(label.name).slice(0, 32) + "\n";
    if (variant) r += ascii(variant).slice(0, 32) + "\n";
    r += CMD.BIG + priceLine + CMD.NORMAL + "\n";
    r += code128(label.code) + "\n" + ascii(label.code) + "\n";
    r += ascii(label.sku) + "\n";
    r += CMD.feed(3) + CMD.CUT;
  }
  return r;
}

// ── Despacho por plataforma ──────────────────────────────────────────────────
function isTauri(): boolean {
  return typeof window !== "undefined" && !!((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);
}

interface TcpPlugin {
  connect(o: { ipAddress: string; port?: number }): Promise<{ client: number }>;
  send(o: { client: number; data: string; encoding?: string }): Promise<unknown>;
  disconnect(o: { client: number }): Promise<unknown>;
}

async function getTcpPlugin(): Promise<TcpPlugin | null> {
  try {
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return null;
    const mod: any = await import("capacitor-tcp-socket");
    return mod.TcpSocket ?? mod.TCPSocket ?? mod.default ?? null;
  } catch {
    return null;
  }
}

export interface PrintResult {
  ok: boolean;
  channel: "tauri" | "tcp" | "web";
  error?: string;
}

// Envía el ESC/POS a la impresora. Devuelve channel:"web" cuando no hay socket
// nativo (el caller debe caer a window.print()).
export async function printEscpos(data: string): Promise<PrintResult> {
  const cfg = getPrinterConfig();

  if (isTauri()) {
    if (!cfg.ip) return { ok: false, channel: "tauri", error: "Configura la IP de la impresora" };
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const bytes = Array.from(data, (ch) => ch.charCodeAt(0) & 0xff);
      await invoke("print_escpos", { host: cfg.ip, port: cfg.port, bytes });
      return { ok: true, channel: "tauri" };
    } catch (e) {
      return { ok: false, channel: "tauri", error: String((e as Error)?.message || e) };
    }
  }

  const tcp = await getTcpPlugin();
  if (tcp) {
    if (!cfg.ip) return { ok: false, channel: "tcp", error: "Configura la IP de la impresora" };
    let client: number | null = null;
    try {
      const conn = await tcp.connect({ ipAddress: cfg.ip, port: cfg.port });
      client = conn.client;
      const CHUNK = 512;
      for (let i = 0; i < data.length; i += CHUNK) {
        await tcp.send({ client, data: data.slice(i, i + CHUNK), encoding: "utf8" });
      }
      return { ok: true, channel: "tcp" };
    } catch (e) {
      return { ok: false, channel: "tcp", error: String((e as Error)?.message || e) };
    } finally {
      if (client !== null) try { await tcp.disconnect({ client }); } catch { /* noop */ }
    }
  }

  return { ok: false, channel: "web" };
}

export const isNativePrinter = () =>
  isTauri() || (typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.());
