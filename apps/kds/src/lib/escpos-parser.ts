/**
 * Parser ESC/POS minimal para extraer texto humano de los payloads
 * que el TPV / Meseros Lite mandan como "ticket impreso".
 *
 * No interpretamos format completo; solo los comandos que el builder
 * del TPV (`buildKitchenTicket` / `buildCustomerReceipt` en
 * apps/tpv/src/lib/printer-tcp.ts y apps/meseros-lite/src/lib/printer.ts)
 * usa para empaquetar la comanda. El resto se descarta.
 *
 * Output: además de las líneas crudas, extraemos los ARTÍCULOS de forma
 * estructurada (cantidad, nombre, modificadores, notas) para que el KDS
 * los liste por separado dentro de cada comanda en vez de pintar un bloque
 * de texto plano "como impresora".
 *
 * Comandos cubiertos:
 *   ESC @     → init (ignorar)
 *   ESC a N   → align (ignorar — el KDS no necesita alineación)
 *   ESC E N   → bold (ignorar)
 *   GS  ! N   → tamaño de letra (ignorar)
 *   GS  V ... → CUT (fin del ticket — corta parsing)
 */

export interface ParsedTicketItem {
  quantity: number;
  name: string;
  modifiers: string[];
  notes: string[];
  // Etiqueta de comensal cuando el ticket viene agrupado por asiento
  // (TPV DINE_IN con groupBySeat): "COMENSAL 2", "COMPARTIDO", etc.
  group?: string;
}

export interface ParsedTicket {
  lines: string[];
  raw: string;
  // Artículos estructurados del cuerpo de la comanda. Vacío para recibos
  // u otros tickets que no siguen el formato `Nx Producto`.
  items: ParsedTicketItem[];
  // Líneas de cabecera informativas (hora, tipo de orden, cliente) ya sin
  // el título, el número de orden ni la mesa (esos van en campos propios).
  headerLines: string[];
  // Algunas heurísticas útiles para clasificar la comanda en la UI.
  isKitchen: boolean;   // true si encontramos la palabra "COMANDA"
  isReceipt: boolean;   // true si encontramos "TOTAL:"
  orderNumber: string | null;
  tableLabel: string | null;
  customerName: string | null;
}

const ESC = 0x1B;
const GS  = 0x1D;
const CUT_BYTE = 0x56; // 'V'

/**
 * Tokeniza un segmento ESC/POS a líneas de texto legibles, deteniéndose en
 * el primer CUT. Devuelve las líneas y el índice del byte siguiente al CUT
 * (o el final del texto) para poder seguir parseando tickets concatenados.
 */
function tokenizeLines(text: string, from: number): { lines: string[]; next: number } {
  const out: string[] = [];
  let current = "";
  let i = from;
  let cutSeen = false;

  while (i < text.length && !cutSeen) {
    const c = text.charCodeAt(i);

    if (c === ESC) {
      const next = text.charCodeAt(i + 1);
      switch (next) {
        case 0x40: i += 2; break;           // ESC @
        case 0x61: i += 3; break;           // ESC a N
        case 0x45: i += 3; break;           // ESC E N
        case 0x64: i += 3; break;           // ESC d N
        case 0x4A: i += 3; break;           // ESC J N
        default: i += 2; break;             // skip 2 bytes by default
      }
      continue;
    }

    if (c === GS) {
      const next = text.charCodeAt(i + 1);
      if (next === 0x21) {                  // GS ! N (size)
        i += 3;
        continue;
      }
      if (next === CUT_BYTE) {              // GS V (cut)
        // Variantes: GS V m (3 bytes) | GS V B m (4 bytes). Avanzamos el
        // cursor más allá del comando para continuar con el siguiente ticket.
        const third = text.charCodeAt(i + 2);
        i += third === 0x42 ? 4 : 3;        // 0x42 = 'B'
        cutSeen = true;
        break;
      }
      i += 3;                               // otros GS X — saltar 3 bytes
      continue;
    }

    if (c === 0x0A) {                       // line feed
      out.push(current);
      current = "";
      i += 1;
      continue;
    }

    if (c < 0x20 && c !== 0x09) {           // otros controles (no tab) → descartar
      i += 1;
      continue;
    }

    current += text[i];
    i += 1;
  }

  if (current.length > 0) out.push(current);

  // Trim por línea, quitar vacías al borde (conservar separadores internos).
  const lines = out.map((l) => l.trimEnd()).filter((_, idx, arr) => {
    if (idx === 0) return (arr[idx] ?? "").length > 0;
    if (idx === arr.length - 1) return (arr[idx] ?? "").length > 0;
    return true;
  });

  return { lines, next: i };
}

const SEPARATOR = /^-{3,}$/;
const ITEM_RE = /^(\d+)\s*x\s+(.+)$/i;
const MODIFIER_RE = /^\+\s*(.+)$/;
const NOTE_RE = /^>\s*(.+)$/;
const GROUP_RE = /^(COMENSAL\b.*|COMPARTIDO)$/i;

function extractItems(lines: string[]): ParsedTicketItem[] {
  // El cuerpo va entre el primer separador y el último. Si solo hay un
  // separador, el cuerpo llega hasta el final.
  const sepPositions: number[] = [];
  lines.forEach((line, idx) => {
    if (SEPARATOR.test(line.trim())) sepPositions.push(idx);
  });
  if (sepPositions.length === 0) return [];

  const bodyStart = (sepPositions[0] ?? -1) + 1;
  const bodyEnd =
    sepPositions.length >= 2 ? (sepPositions[sepPositions.length - 1] ?? lines.length) : lines.length;

  const items: ParsedTicketItem[] = [];
  let current: ParsedTicketItem | null = null;
  let group: string | undefined;

  for (const raw of lines.slice(bodyStart, bodyEnd)) {
    const line = raw.trim();
    if (!line || SEPARATOR.test(line)) continue;

    const groupMatch = line.match(GROUP_RE);
    if (groupMatch) {
      group = line;
      current = null;
      continue;
    }

    const itemMatch = line.match(ITEM_RE);
    if (itemMatch) {
      current = {
        quantity: Number(itemMatch[1]) || 1,
        name: (itemMatch[2] ?? "").trim(),
        modifiers: [],
        notes: [],
        ...(group ? { group } : {}),
      };
      items.push(current);
      continue;
    }

    const modMatch = line.match(MODIFIER_RE);
    if (modMatch && current) {
      current.modifiers.push((modMatch[1] ?? "").trim());
      continue;
    }

    const noteMatch = line.match(NOTE_RE);
    if (noteMatch && current) {
      current.notes.push((noteMatch[1] ?? "").trim());
      continue;
    }

    // Línea de cuerpo desconocida: si hay item en curso, la tratamos como
    // nota; si no, la ignoramos (no rompemos el parseo).
    if (current) current.notes.push(line);
  }

  return items;
}

function extractHeaderLines(lines: string[]): string[] {
  const firstSep = lines.findIndex((l) => SEPARATOR.test(l.trim()));
  const headerEnd = firstSep >= 0 ? firstSep : lines.length;
  // Saltamos la primera línea (título tipo "COMANDA") y descartamos el
  // número de orden (#..) y la mesa, que se muestran en campos propios.
  return lines
    .slice(1, headerEnd)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^#/.test(l) && !/^mesa\s+/i.test(l));
}

function buildParsed(lines: string[], raw: string): ParsedTicket {
  const joined = lines.join("\n").toUpperCase();
  const isKitchen = joined.includes("COMANDA");
  const isReceipt = joined.includes("TOTAL:") || joined.includes("PAGADO");

  const orderNumber = extractFirstMatch(lines, /^#\s?([A-Za-z0-9\-]+)/);
  const tableLabel = extractFirstMatch(lines, /^Mesa\s+(.+)$/i);

  // Los recibos llevan precios por línea (`Nx Producto   $xx`), no son
  // comandas de cocina — no los desglosamos como artículos.
  const items = isReceipt ? [] : extractItems(lines);

  return {
    lines,
    raw,
    items,
    headerLines: extractHeaderLines(lines),
    isKitchen,
    isReceipt,
    orderNumber,
    tableLabel,
    customerName: null,
  };
}

/**
 * Parsea UN ticket (hasta el primer CUT). Se mantiene por compatibilidad;
 * para payloads que pueden traer varias comandas concatenadas usa
 * `parseEscPosTickets`.
 */
export function parseEscPos(text: string): ParsedTicket {
  const { lines } = tokenizeLines(text, 0);
  return buildParsed(lines, text);
}

/**
 * Parsea TODOS los tickets de un payload. Un cliente puede mandar varias
 * comandas en un mismo envío TCP (cada una termina en su propio CUT); aquí
 * las separamos para que el KDS muestre una tarjeta por comanda en vez de
 * perder todo lo que venga después del primer corte.
 */
export function parseEscPosTickets(text: string): ParsedTicket[] {
  const tickets: ParsedTicket[] = [];
  let offset = 0;
  // Límite defensivo para no quedar en bucle ante payloads raros.
  while (offset < text.length && tickets.length < 50) {
    const { lines, next } = tokenizeLines(text, offset);
    if (lines.length > 0) tickets.push(buildParsed(lines, text.slice(offset, next)));
    if (next <= offset) break;
    offset = next;
  }
  return tickets;
}

function extractFirstMatch(lines: string[], pattern: RegExp): string | null {
  for (const line of lines) {
    const m = line.match(pattern);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}
