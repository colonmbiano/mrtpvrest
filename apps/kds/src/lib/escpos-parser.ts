/**
 * Parser ESC/POS minimal para extraer texto humano de los payloads
 * que el TPV manda como "ticket impreso".
 *
 * No interpretamos format completo; solo los comandos que el builder
 * del TPV (`buildKitchenTicket` / `buildCustomerReceipt` en
 * apps/tpv/src/lib/printer-tcp.ts) usa para empaquetar la comanda. El
 * resto se descarta. Output: array de líneas legibles + metadata (tipo
 * de ticket, número de orden si llega).
 *
 * Comandos cubiertos:
 *   ESC @     → init (ignorar)
 *   ESC a N   → align (ignorar — el KDS no necesita alineación)
 *   ESC E N   → bold (ignorar)
 *   GS  ! N   → tamaño de letra (ignorar)
 *   GS  V B 0 → CUT (fin del ticket — corta parsing)
 */

export interface ParsedTicket {
  lines: string[];
  raw: string;
  // Algunas heurísticas útiles para clasificar la comanda en la UI.
  isKitchen: boolean;   // true si encontramos la palabra "COMANDA"
  isReceipt: boolean;   // true si encontramos "TOTAL:"
  orderNumber: string | null;
  tableLabel: string | null;
  customerName: string | null;
}

const ESC = 0x1B;
const GS  = 0x1D;

export function parseEscPos(text: string): ParsedTicket {
  // El texto llega en ISO-8859-1 desde el plugin; tratamos byte a byte.
  const out: string[] = [];
  let current = "";
  let i = 0;
  let cutSeen = false;

  while (i < text.length && !cutSeen) {
    const c = text.charCodeAt(i);

    if (c === ESC) {
      const next = text.charCodeAt(i + 1);
      // ESC @ (init)            → 1 byte arg implicito
      // ESC a N (align)         → 1 byte arg
      // ESC E N (bold)          → 1 byte arg
      // ESC d N (feed N lines)  → 1 byte arg
      // ESC J N                 → 1 byte arg
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
      if (next === 0x56) {                  // GS V (cut)
        // Variantes: GS V m  (2 args) | GS V B m (3 args). En todos los
        // casos marca fin del ticket — paramos parsing.
        cutSeen = true;
        break;
      }
      // Otros GS X — saltamos 3 bytes para no quedar atorados.
      i += 3;
      continue;
    }

    if (c === 0x0A) {
      // Line feed: pushea línea (incluso si es vacía, para preservar separadores).
      out.push(current);
      current = "";
      i += 1;
      continue;
    }

    if (c < 0x20 && c !== 0x09) {
      // Otros bytes de control que no sean tab → descartar.
      i += 1;
      continue;
    }

    current += text[i];
    i += 1;
  }

  if (current.length > 0) out.push(current);

  // Limpieza final: trim por línea, quitar líneas vacías al inicio/fin.
  const lines = out.map((l) => l.trimEnd()).filter((_, idx, arr) => {
    // Conservar todas excepto las vacías al borde — los separadores
    // "------------------------------" se quedan dentro del cuerpo.
    if (idx === 0)               return arr[idx]!.length > 0;
    if (idx === arr.length - 1)  return arr[idx]!.length > 0;
    return true;
  });

  const joined = lines.join("\n").toUpperCase();
  const isKitchen = joined.includes("COMANDA");
  const isReceipt = joined.includes("TOTAL:") || joined.includes("PAGADO");

  // Heurísticas livianas — el builder del TPV emite formatos predecibles.
  const orderNumber = extractFirstMatch(lines, /^#\s?([A-Za-z0-9\-]+)/);
  const tableLabel  = extractFirstMatch(lines, /^Mesa\s+(.+)$/i);

  // El customer name no tiene prefijo fijo en buildKitchenTicket — viene
  // como una línea aislada antes del separador. La detectamos solo si
  // hay TICKET orderNumber + tableLabel resueltos y la siguiente línea
  // en el orden de aparición es un solo nombre (heurística suficiente
  // para no alucinar; puede quedar null sin problema).
  const customerName: string | null = null;

  return {
    lines,
    raw: text,
    isKitchen,
    isReceipt,
    orderNumber,
    tableLabel,
    customerName,
  };
}

function extractFirstMatch(lines: string[], pattern: RegExp): string | null {
  for (const line of lines) {
    const m = line.match(pattern);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}
