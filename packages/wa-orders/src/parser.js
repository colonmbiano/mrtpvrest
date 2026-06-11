// Parser de pedidos: texto libre → items del menú.
//
// FASE 0: matcher heurístico (sin IA, sin API key) — suficiente para probar el
// flujo completo texto→TPV. Hace match por tokens contra las "unidades" del
// menú (producto + variante), ponderando por RAREZA de palabra (IDF) para que
// los tokens distintivos ("hawaiana", "bbq", "arrachera") manden sobre los
// genéricos ("hamburguesa", "alitas"). Detecta cantidades ("2", "dos", "x2").
//
// FASE 1: se le puede inyectar un parser de IA vía la opción `llm`
// (p.ej. Groq/Gemini, o reusar /api/ai/order-dictation). Si `llm` viene, se usa
// y el heurístico queda como respaldo. La firma de salida es la misma.

const STOP = new Set([
  "quiero","quisiera","me","da","das","dame","mandame","mándame","manda","pide","pido",
  "un","una","uno","unos","unas","de","del","con","y","por","favor","porfa","para",
  "el","la","los","las","mi","tu","su","que","es","esta","este","hola","buenas",
  "buenos","dias","días","tardes","noches","ocupo","necesito","seria","sería",
  "porfavor","plis","please","al","a","en","o","u","ya","si","sí","tambien","también",
  "ademas","además","quiere","quieren","gustaria","gustaría","poner","pon","ponme",
]);

const NUM_WORDS = {
  un:1, una:1, uno:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7,
  ocho:8, nueve:9, diez:10, once:11, doce:12, media:1, par:2,
};

const norm = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[@¡!¿?.()"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Stem ligero: une singular/plural ("hamburguesas" → "hamburguesa").
const stem = (t) => (t.length >= 4 && t.endsWith("s") ? t.slice(0, -1) : t);

// Distancia de edición (Levenshtein) acotada — tolera typos del menú o del
// cliente ("hawaiana" vs "hawaiiana"). Para tokens largos permitimos 1-2 erratas.
function editDist(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0]; dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[m];
}
// ¿El token del fragmento equivale al de la etiqueta? (igual, subcadena o typo)
function fuzzyEq(ft, lt) {
  if (ft === lt) return true;
  if (lt.length >= 4 && (ft.includes(lt) || lt.includes(ft))) return true;
  const maxLen = Math.max(ft.length, lt.length);
  if (maxLen < 5) return false;
  return editDist(ft, lt) <= (maxLen >= 7 ? 2 : 1);
}
const sig = (tokens) => tokens.filter((t) => t.length >= 2 && !STOP.has(t)).map(stem);

// Divide el mensaje en fragmentos candidatos (un producto por fragmento).
function splitFragments(text) {
  return norm(text)
    .split(/,|\n|\+|\by\b/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Extrae cantidad del fragmento (al inicio, como palabra-número, o "xN").
// Devuelve la cantidad y el resto del texto sin el indicador numérico.
function extractQty(fragment) {
  let qty = 1, found = false;
  let rest = fragment;
  let m;
  if ((m = rest.match(/\bx\s?(\d{1,2})\b/))) { qty = parseInt(m[1]); found = true; rest = rest.replace(m[0], " "); }
  // primer dígito suelto del fragmento
  if (!found && (m = rest.match(/(?:^|\s)(\d{1,2})(?:\s|$)/))) { qty = parseInt(m[1]); found = true; rest = rest.replace(m[0], " "); }
  // palabra-número (dos, tres...) — solo si no había dígito
  if (!found) {
    for (const w of rest.split(" ")) {
      if (NUM_WORDS[w] != null) { qty = NUM_WORDS[w]; rest = rest.replace(new RegExp(`\\b${w}\\b`), " "); break; }
    }
  }
  return { qty: Math.max(1, Math.min(50, qty)), rest: rest.replace(/\s+/g, " ").trim() };
}

// Frecuencia de cada token (stemmeado) entre todas las etiquetas del menú.
// Tokens raros → peso alto (IDF). Se calcula una vez por parseo.
function buildIdf(units) {
  const df = new Map();
  const N = units.length || 1;
  for (const u of units) {
    const toks = new Set(sig(norm(u.label).split(" ")));
    for (const t of toks) df.set(t, (df.get(t) || 0) + 1);
  }
  const idf = (t) => Math.log((N + 1) / ((df.get(t) || 0) + 1)) + 0.1;
  return idf;
}

function scoreUnit(fragTokens, unit, idf) {
  const fragSet = new Set(fragTokens);
  const labelTokens = [...new Set(sig(norm(unit.label).split(" ")))];
  if (labelTokens.length === 0) return null;
  let matched = 0, weight = 0;
  for (const lt of labelTokens) {
    if (fragSet.has(lt) || fragTokens.some((ft) => fuzzyEq(ft, lt))) {
      matched++; weight += idf(lt);
    }
  }
  if (matched === 0) return null;
  const coverage = matched / labelTokens.length;
  // Peso (rareza) manda; cobertura y conteo desempatan.
  const score = weight * 100 + coverage * 10 + matched;
  return { matched, total: labelTokens.length, coverage, weight, score };
}

function matchFragment(fragment, units, idf) {
  const { qty, rest } = extractQty(fragment);
  const fragTokens = sig(norm(rest).split(" "));
  if (fragTokens.length === 0) return null;
  let best = null;
  for (const unit of units) {
    const s = scoreUnit(fragTokens, unit, idf);
    if (!s) continue;
    if (!best || s.score > best.score) best = { unit, ...s };
  }
  if (!best) return null;
  const confidence =
    best.matched >= 2 || best.coverage >= 1 ? "alta" : best.matched === 1 ? "media" : "baja";
  return {
    menuItemId: best.unit.menuItemId,
    variantId: best.unit.variantId,
    label: best.unit.label,
    price: best.unit.price,
    quantity: qty,
    confidence,
    raw: fragment,
  };
}

/**
 * Parsea un texto de pedido contra el menú.
 * @param {string} text
 * @param {{units: Array}} menu  (de fetchMenu)
 * @param {{ llm?: (text, menu) => Promise<{items:Array, unmatched:string[]}> }} [opts]
 * @returns {Promise<{items: Array, unmatched: string[]}>}
 */
export async function parseOrder(text, menu, opts = {}) {
  if (typeof opts.llm === "function") {
    return opts.llm(text, menu); // FASE 1: parser de IA inyectado
  }
  const units = menu.units || [];
  const idf = buildIdf(units);
  const items = [];
  const unmatched = [];
  for (const frag of splitFragments(text)) {
    const match = matchFragment(frag, units, idf);
    if (match) items.push(match);
    else if (sig(norm(frag).split(" ")).length > 0) unmatched.push(frag);
  }
  return { items, unmatched };
}
