/**
 * wa-parse.ts — parser local (sin IA) para la pantalla de captura de pedidos
 * de WhatsApp (`app/pos/whatsapp/page.tsx`).
 *
 * Toma el texto pegado de un chat y deduce, con heurísticas y fuzzy-match
 * contra el catálogo real:
 *   · tipo de entrega (Comer aquí / Llevar / Domicilio)
 *   · nombre, teléfono y dirección del cliente
 *   · líneas de producto (cantidad + match al menú + notas)
 *
 * Es 100% offline: NO llama a ninguna API ni necesita key. El humano corrige
 * el resultado antes de crear el pedido — esto solo le ahorra teclear.
 */
import type { Product } from "@/store/ticketStore";

export type OrderType = "DINE_IN" | "TAKEOUT" | "DELIVERY";

export interface ParsedLine {
  /** Renglón original tal cual, para que el cajero lo coteje. */
  raw: string;
  quantity: number;
  /** Texto del producto ya limpio (sin cantidad ni notas). */
  productQuery: string;
  /** Nota detectada (paréntesis o texto tras guión/coma). */
  notes: string;
  /** Mejor coincidencia del catálogo (o null si no hubo suficiente score). */
  match: Product | null;
  score: number;
}

export interface ParsedOrder {
  orderType: OrderType;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  lines: ParsedLine[];
}

/** lowercase + sin acentos + sin puntuación + espacios colapsados. */
export function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Score 0..1 de qué tan bien `query` describe a `target` (ambos crudos; se
 * normalizan adentro). Combina: substring exacto (fuerte), solape de tokens y
 * subsecuencia de caracteres como red de seguridad.
 */
export function matchScore(target: string, query: string): number {
  const t = normalize(target);
  const q = normalize(query);
  if (!t || !q) return 0;
  if (t === q) return 1;
  if (t.includes(q)) return 0.9 + Math.min(0.1, q.length / Math.max(t.length, 1) * 0.1);

  const qTokens = q.split(" ").filter((w) => w.length >= 2);
  const tTokens = t.split(" ").filter(Boolean);
  if (qTokens.length === 0) return 0;

  // Match exacto de token pesa 1; prefijo (ej. "cola"→"colada") pesa solo 0.5
  // para que un prefijo débil no iguale a una coincidencia exacta y produzca
  // falsos positivos ("Coca cola" → "Piña Colada").
  let weighted = 0;
  for (const qt of qTokens) {
    if (tTokens.some((tt) => tt === qt)) {
      weighted += 1;
    } else if (
      tTokens.some(
        (tt) => (tt.startsWith(qt) || qt.startsWith(tt)) && Math.min(tt.length, qt.length) >= 3,
      )
    ) {
      weighted += 0.5;
    }
  }
  const tokenRatio = weighted / qTokens.length;

  // Subsecuencia de caracteres (cubre abreviaturas tipo "hamb hawai").
  let i = 0;
  for (const ch of t) {
    if (i < q.length && ch === q.charAt(i)) i += 1;
  }
  const subseq = i / q.length;

  return Math.max(tokenRatio * 0.85, subseq * 0.5);
}

// Detecta intención de tamaño en el texto del cliente.
const QUERY_KILO_RE = /\b(kilo|kilos|kg|1\s*k|medio\s*kilo|1\/2\s*kilo|half\s*kilo)\b/;

/**
 * Sesgo de tamaño orden-vs-kilo. Regla del negocio: si el cliente NO dice
 * "kilo", se asume ORDEN (porción) — nunca el kilo (más caro). Evita el error
 * de matchear "1 Orden de Alitas" contra "1 KG de Alitas".
 */
function sizeBias(productName: string, query: string): number {
  const p = normalize(productName);
  const queryKilo = QUERY_KILO_RE.test(normalize(query));
  const prodKilo = /\b(kilo|kilos|kg)\b/.test(p);
  const prodOrden = /\borden\b/.test(p);
  if (queryKilo) return prodKilo ? 1.2 : prodOrden ? 0.6 : 1; // pidió kilo → prefiere kilo
  if (prodKilo) return 0.55; // no pidió kilo pero el producto es kilo → penaliza fuerte
  if (prodOrden) return 1.15; // prefiere "Orden de…"
  return 1;
}

/** Devuelve el mejor producto del catálogo para un texto, con su score. */
export function bestMatch(query: string, products: Product[]): { match: Product | null; score: number } {
  let best: Product | null = null;
  let bestScore = 0;
  for (const p of products) {
    if (p?.isAvailable === false) continue;
    const s = matchScore(p.name, query) * sizeBias(p.name, query);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  return { match: best, score: bestScore };
}

const MATCH_THRESHOLD = 0.4;

// Renglones que son metadatos, no productos.
const META_LINE = /^\s*(cliente|nombre|tel(e|é)fono|tel|cel|whats?app|direcci(o|ó)n|dir|domicilio|pago|total|subtotal|entrega|hora|pedido|orden|nota|comentario|forma de pago|m(e|é)todo)\b\s*[:\-]/i;

const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;

function detectOrderType(text: string): OrderType {
  const n = normalize(text);
  if (/\b(domicilio|delivery|a domicilio|envio|reparto|mandar|llevarselo)\b/.test(n)) return "DELIVERY";
  if (/\b(para llevar|llevar|pickup|recoger|pasa por|paso por)\b/.test(n)) return "TAKEOUT";
  if (/\b(comer aqui|en mesa|mesa|local|aqui)\b/.test(n)) return "DINE_IN";
  return "TAKEOUT";
}

function cleanDigits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

/** Extrae cantidad inicial / final y notas (paréntesis o tras guión). */
function parseLine(raw: string, products: Product[]): ParsedLine | null {
  let line = raw.trim();
  if (!line) return null;
  // Bullets/numeración decorativa.
  line = line.replace(/^\s*[-*•·]\s*/, "").trim();
  if (!line) return null;
  if (META_LINE.test(line)) return null;

  // Notas: lo que esté entre paréntesis.
  let notes = "";
  const paren = line.match(/\(([^)]*)\)/);
  if (paren) {
    notes = (paren[1] ?? "").trim();
    line = line.replace(paren[0] ?? "", " ").replace(/\s+/g, " ").trim();
  }

  // Cantidad: "2 x Producto", "2x Producto", "2 Producto", "Producto x2".
  let quantity = 1;
  let body = line;
  const leading = line.match(/^(\d{1,3})\s*[xX]?\s+(.+)$/);
  const trailing = line.match(/^(.+?)\s*[xX]\s*(\d{1,3})$/);
  if (leading) {
    quantity = Math.max(1, parseInt(leading[1] ?? "1", 10) || 1);
    body = leading[2] ?? body;
  } else if (trailing) {
    quantity = Math.max(1, parseInt(trailing[2] ?? "1", 10) || 1);
    body = trailing[1] ?? body;
  }

  // Nota extra tras guión/coma al final ("... - sin cebolla").
  const dash = body.match(/^(.+?)\s+[-–]\s+(.+)$/);
  if (dash) {
    const head = (dash[1] ?? "").trim();
    const tail = (dash[2] ?? "").trim();
    if (head) {
      body = head;
      notes = notes ? `${notes}, ${tail}` : tail;
    }
  }

  const productQuery = body.trim();
  // Un renglón de puro número o muy corto no es producto.
  if (!productQuery || /^\d+$/.test(productQuery) || normalize(productQuery).length < 2) return null;
  // Línea de teléfono/metadato sin etiqueta con ":" (ej. "Tel 7228447174"):
  // muchos dígitos y pocas letras → no es un producto.
  const digitCount = productQuery.replace(/\D/g, "").length;
  const letterCount = productQuery.replace(/[^a-zA-Z]/g, "").length;
  if (digitCount >= 8 && letterCount <= 5) return null;

  const { match, score } = bestMatch(productQuery, products);
  const matched = score >= MATCH_THRESHOLD ? match : null;

  // Palabras del texto que NO están en el nombre del producto (ej. "BBQ" en
  // "Alitas BBQ" → "Alitas") se conservan como nota para no perder la intención.
  if (matched) {
    const nameNorm = normalize(matched.name);
    const leftover = normalize(productQuery)
      .split(" ")
      .filter((w) => w.length >= 2 && !nameNorm.includes(w));
    if (leftover.length) {
      const hint = leftover.join(" ");
      notes = notes ? `${notes}, ${hint}` : hint;
    }
  }

  return { raw, quantity, productQuery, notes, match: matched, score };
}

/** Punto de entrada: texto pegado + catálogo → pedido estructurado editable. */
export function parseWhatsappOrder(text: string, products: Product[]): ParsedOrder {
  const rawLines = (text || "").split(/\r?\n/);

  let customerName = "";
  let customerPhone = "";
  let deliveryAddress = "";

  for (const raw of rawLines) {
    const l = raw.trim();
    if (!l) continue;

    // Etiquetas explícitas.
    const nameLbl = l.match(/^(cliente|nombre)\s*[:\-]\s*(.+)$/i);
    if (nameLbl?.[2] && !customerName) customerName = nameLbl[2].trim();

    const addrLbl = l.match(/^(direcci(o|ó)n|dir|domicilio)\s*[:\-]\s*(.+)$/i);
    if (addrLbl?.[3] && !deliveryAddress) deliveryAddress = addrLbl[3].trim();

    const phoneLbl = l.match(/^(tel(e|é)fono|tel|cel|whats?app)\s*[:\-]\s*(.+)$/i);
    if (phoneLbl?.[3] && !customerPhone) {
      const d = cleanDigits(phoneLbl[3]);
      if (d.length >= 8) customerPhone = d;
    }

    // Teléfono suelto en cualquier renglón.
    if (!customerPhone) {
      const m = l.match(PHONE_RE);
      if (m?.[1]) {
        const d = cleanDigits(m[1]);
        if (d.length >= 10 && d.length <= 13) customerPhone = d;
      }
    }
  }

  const lines: ParsedLine[] = [];
  for (const raw of rawLines) {
    const parsed = parseLine(raw, products);
    if (parsed) lines.push(parsed);
  }

  return {
    orderType: detectOrderType(text),
    customerName,
    customerPhone,
    deliveryAddress,
    lines,
  };
}
