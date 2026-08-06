/**
 * Cliente de impresión ESC/POS por WebUSB (navegador Chrome/Edge).
 *
 * El APK usa TCP nativo al puerto 9100 (ver printer-tcp.ts), pero un navegador
 * NO puede abrir sockets TCP crudos. La alternativa nativa de Chromium para
 * hablarle a una impresora térmica USB enchufada a la misma PC es WebUSB
 * (`navigator.usb`): se envía el MISMO buffer ESC/POS crudo por el endpoint
 * bulk OUT del dispositivo. El pulso de apertura de cajón (ESC p) viaja igual,
 * así que "imprimir tickets" y "abrir cajón" desde Chrome comparten esta vía.
 *
 * Requisitos:
 *   - Contexto seguro (HTTPS) — tpv.mrtpvrest corre en Vercel sobre HTTPS.
 *   - `requestDevice()` (vincular) exige un gesto del usuario (un click). Una vez
 *     concedido, el permiso queda guardado por origen: `getDevices()` recupera el
 *     dispositivo SIN volver a pedir gesto, así los tickets salen automáticos.
 *   - En Windows la impresora no debe estar tomada por el driver del sistema; si
 *     `claimInterface` falla, se avisa con un mensaje accionable (usar WinUSB).
 *
 * Todo se degrada con gracia: si WebUSB no existe o no hay impresora vinculada,
 * las funciones lanzan un error claro y el orquestador lo reporta sin romper el
 * flujo del POS.
 */

// ── Tipos mínimos de WebUSB ───────────────────────────────────────────────
//
// La lib "dom" de TS no siempre incluye los tipos de WebUSB, así que
// declaramos localmente lo que usamos (mismo patrón que el plugin TCP) en vez
// de acoplarnos a @types/w3c-web-usb.

interface USBEndpointLite {
  endpointNumber: number;
  direction: "in" | "out";
  type: "bulk" | "interrupt" | "isochronous";
}
interface USBAlternateLite {
  alternateSetting: number;
  interfaceClass: number;
  endpoints: USBEndpointLite[];
}
interface USBInterfaceLite {
  interfaceNumber: number;
  alternate: USBAlternateLite;
  alternates: USBAlternateLite[];
}
interface USBConfigurationLite {
  configurationValue: number;
  interfaces: USBInterfaceLite[];
}
interface USBDeviceLite {
  vendorId: number;
  productId: number;
  serialNumber?: string | null;
  productName?: string | null;
  manufacturerName?: string | null;
  opened: boolean;
  configuration: USBConfigurationLite | null;
  configurations: USBConfigurationLite[];
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: Uint8Array): Promise<{ bytesWritten: number; status: string }>;
}
interface USBLite {
  getDevices(): Promise<USBDeviceLite[]>;
  requestDevice(options: { filters: Array<Record<string, number>> }): Promise<USBDeviceLite>;
}

function getUsb(): USBLite | null {
  if (typeof navigator === "undefined") return null;
  const usb = (navigator as unknown as { usb?: USBLite }).usb;
  return usb ?? null;
}

/** ¿El navegador expone WebUSB? (Chrome/Edge de escritorio sobre HTTPS). */
export function isWebUsbAvailable(): boolean {
  return getUsb() !== null;
}

// ── Persistencia del dispositivo vinculado ────────────────────────────────
//
// El permiso WebUSB lo guarda el navegador por origen, pero necesitamos saber
// CUÁL de los dispositivos permitidos es la impresora elegida (puede haber más
// de uno). Guardamos su identidad (vendor/product/serial) en localStorage y la
// recuperamos vía getDevices() sin volver a pedir gesto.

const USB_PRINTER_KEY = "tpv-usb-printer";

export interface UsbPrinterInfo {
  vendorId: number;
  productId: number;
  serialNumber?: string | null;
  name?: string | null;
}

export function getSavedUsbPrinter(): UsbPrinterInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USB_PRINTER_KEY);
    return raw ? (JSON.parse(raw) as UsbPrinterInfo) : null;
  } catch {
    return null;
  }
}

function saveUsbPrinter(info: UsbPrinterInfo): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(USB_PRINTER_KEY, JSON.stringify(info));
  } catch {
    /* cuota / modo privado — el permiso del navegador sigue; solo perdemos la preferencia */
  }
}

export function clearUsbPrinter(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(USB_PRINTER_KEY);
  } catch {
    /* noop */
  }
}

const describeDevice = (d: USBDeviceLite): string =>
  d.productName?.trim() ||
  d.manufacturerName?.trim() ||
  `USB ${d.vendorId.toString(16).padStart(4, "0")}:${d.productId.toString(16).padStart(4, "0")}`;

/**
 * Abre el diálogo del navegador para elegir la impresora USB. DEBE llamarse
 * dentro de un gesto del usuario (click). Guarda la elección para futuros
 * envíos automáticos. Filtros vacíos = muestra todos los dispositivos, porque
 * las térmicas usan clases/vendors muy variados y filtrar de más las esconde.
 */
export async function pairUsbPrinter(): Promise<UsbPrinterInfo> {
  const usb = getUsb();
  if (!usb) throw new Error("Este navegador no soporta WebUSB (usa Chrome o Edge de escritorio).");
  const device = await usb.requestDevice({ filters: [] });
  const info: UsbPrinterInfo = {
    vendorId: device.vendorId,
    productId: device.productId,
    serialNumber: device.serialNumber ?? null,
    name: describeDevice(device),
  };
  saveUsbPrinter(info);
  return info;
}

/**
 * Recupera el USBDevice vinculado desde los permitidos por el navegador. Empata
 * por la identidad guardada; si no hay preferencia guardada pero solo hay un
 * dispositivo permitido, usa ese. null = hay que vincular (pairUsbPrinter).
 */
async function acquireDevice(): Promise<USBDeviceLite | null> {
  const usb = getUsb();
  if (!usb) return null;
  const devices = await usb.getDevices();
  if (devices.length === 0) return null;

  const saved = getSavedUsbPrinter();
  if (saved) {
    const match =
      devices.find(
        (d) =>
          d.vendorId === saved.vendorId &&
          d.productId === saved.productId &&
          (saved.serialNumber == null || d.serialNumber === saved.serialNumber),
      ) ??
      devices.find((d) => d.vendorId === saved.vendorId && d.productId === saved.productId);
    if (match) return match;
  }
  // Sin preferencia (o el guardado ya no está): si hay exactamente uno, úsalo.
  return devices.length === 1 ? devices[0]! : null;
}

/** ¿Hay una impresora USB lista para imprimir sin pedir gesto? */
export async function hasUsablePairedPrinter(): Promise<boolean> {
  try {
    return (await acquireDevice()) !== null;
  } catch {
    return false;
  }
}

/** Nombre legible de la impresora vinculada (para la UI). null si no hay. */
export async function getPairedPrinterName(): Promise<string | null> {
  const saved = getSavedUsbPrinter();
  if (saved?.name) return saved.name;
  try {
    const d = await acquireDevice();
    return d ? describeDevice(d) : null;
  } catch {
    return null;
  }
}

// ── Selección de endpoint bulk OUT ────────────────────────────────────────

interface BulkOut {
  configurationValue: number;
  interfaceNumber: number;
  endpointNumber: number;
}

/**
 * Encuentra el primer endpoint bulk OUT del dispositivo. Prioriza la interfaz
 * de clase impresora (7); si no hay, cae a cualquier interfaz con un bulk OUT
 * (impresoras con clase vendor-específica). Devuelve null si no hay ninguno.
 */
function findBulkOut(device: USBDeviceLite): BulkOut | null {
  const configs = device.configuration ? [device.configuration] : device.configurations;
  const scan = (preferPrinterClass: boolean): BulkOut | null => {
    for (const config of configs) {
      for (const iface of config.interfaces) {
        const alt = iface.alternate ?? iface.alternates?.[0];
        if (!alt) continue;
        if (preferPrinterClass && alt.interfaceClass !== 7) continue;
        const ep = alt.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
        if (ep) {
          return {
            configurationValue: config.configurationValue,
            interfaceNumber: iface.interfaceNumber,
            endpointNumber: ep.endpointNumber,
          };
        }
      }
    }
    return null;
  };
  return scan(true) ?? scan(false);
}

// El bulk OUT de las térmicas tiene un buffer chico: troceamos igual que TCP
// (~4KB de buffer típico) con una pausa breve entre chunks para no desbordarlo.
const USB_CHUNK_BYTES = 8 * 1024;
const CHUNK_DELAY_MS = 20;
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Envía bytes ESC/POS crudos a la impresora USB vinculada. Abre, reclama la
 * interfaz, escribe en chunks y libera SIEMPRE (finally). Lanza con mensaje
 * claro si no hay dispositivo, no tiene endpoint imprimible o el SO retiene la
 * interfaz (caso Windows sin WinUSB).
 */
export async function sendRawUsb(bytes: Uint8Array): Promise<void> {
  const usb = getUsb();
  if (!usb) throw new Error("Este navegador no soporta WebUSB (usa Chrome o Edge de escritorio).");

  const device = await acquireDevice();
  if (!device) {
    throw new Error("No hay impresora USB vinculada. Vincúlala en Ajustes → Impresoras (Chrome).");
  }

  await device.open();
  let claimed: number | null = null;
  try {
    if (device.configuration === null) {
      const first = device.configurations[0];
      await device.selectConfiguration(first ? first.configurationValue : 1);
    }
    const bulk = findBulkOut(device);
    if (!bulk) {
      throw new Error("La impresora USB no expone un endpoint imprimible (bulk OUT).");
    }
    if (device.configuration?.configurationValue !== bulk.configurationValue) {
      await device.selectConfiguration(bulk.configurationValue);
    }
    try {
      await device.claimInterface(bulk.interfaceNumber);
    } catch (e) {
      throw new Error(
        "No se pudo tomar la impresora USB (¿la tiene el driver de Windows? instala WinUSB para esta impresora). " +
          ((e as Error)?.message || ""),
      );
    }
    claimed = bulk.interfaceNumber;

    for (let offset = 0; offset < bytes.length; offset += USB_CHUNK_BYTES) {
      const chunk = bytes.subarray(offset, offset + USB_CHUNK_BYTES);
      const res = await device.transferOut(bulk.endpointNumber, chunk);
      if (res.status !== "ok") {
        throw new Error(`Fallo de escritura USB (status: ${res.status}).`);
      }
      if (offset + USB_CHUNK_BYTES < bytes.length) await delay(CHUNK_DELAY_MS);
    }
  } finally {
    if (claimed !== null) {
      try { await device.releaseInterface(claimed); } catch { /* noop */ }
    }
    try { await device.close(); } catch { /* noop */ }
  }
}
