const { prisma } = require('@mrtpvrest/database');
const OpenAI = require('openai');
const { resolveGroqKey } = require('./ai-key.service');
const { GROQ_BASE_URL, GROQ_MODEL } = require('./groq-error');

const QUANTITY_WORDS = new Map([
  ['un', 1],
  ['uno', 1],
  ['una', 1],
  ['unos', 1],
  ['unas', 1],
  ['par', 2],
  ['dos', 2],
  ['tres', 3],
  ['cuatro', 4],
  ['cinco', 5],
  ['seis', 6],
  ['siete', 7],
  ['ocho', 8],
  ['nueve', 9],
  ['diez', 10],
  ['once', 11],
  ['doce', 12],
  ['trece', 13],
  ['catorce', 14],
  ['quince', 15],
  ['dieciseis', 16],
  ['diecisiete', 17],
  ['dieciocho', 18],
  ['diecinueve', 19],
  ['veinte', 20],
]);

const STOP_WORDS = new Set([
  'de',
  'del',
  'la',
  'las',
  'el',
  'los',
  'al',
  'a',
  'para',
  'por',
  'pedido',
  'orden',
  'pon',
  'ponme',
  'agrega',
  'agregame',
  'quiero',
  'dame',
  'con',
]);

const NOTE_RE = /\b(sin|extra|poco|poca|bien|no|menos|mas|aparte|quemado|dorada|dorado|frio|fria|caliente)\b/i;

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularize(token) {
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function tokenize(value) {
  return normalize(value)
    .split(' ')
    .map(singularize)
    .filter((token) => token && !STOP_WORDS.has(token));
}

function isQuantityToken(token) {
  return /^\d+$/.test(token) || QUANTITY_WORDS.has(token);
}

/**
 * Divide el dictado en segmentos, uno por producto. Estrategia:
 *   1. Corte duro por puntuación (`. ; , \n`) — cuando el STT la incluye.
 *   2. Dentro de cada parte, abre un nuevo segmento cada vez que aparece una
 *      CANTIDAD nueva después de que ya hubo contenido (producto). Esto separa
 *      "una hamburguesa dos cocas" y "una hamburguesa y una coca" sin depender
 *      de comas (que el dictado de Android no agrega).
 *
 * No cortamos por el conector "y" suelto: así nombres como "Café y Té" o
 * "Burritos y Gringas" siguen matcheando como un solo producto.
 */
function splitPrompt(prompt) {
  const rawParts = String(prompt || '').split(/[.;,\n]+/);
  const segments = [];
  // Conectores sueltos: se omiten (ni dividen ni cuentan como contenido). Así
  // "una coca y unas papas" separa por la cantidad ("unas"), pero un nombre con
  // conector como "Café y Té" o "Burritos y Gringas" sigue matcheando entero.
  const CONNECTORS = new Set(['y', 'e', 'tambien', 'aparte', 'ademas']);

  for (const raw of rawParts) {
    const tokens = normalize(raw).split(' ').filter(Boolean);
    let cur = [];
    let hasContent = false;

    for (const token of tokens) {
      if (CONNECTORS.has(token)) continue;
      if (isQuantityToken(token) && hasContent) {
        segments.push(cur.join(' '));
        cur = [token];
        hasContent = false;
        continue;
      }
      cur.push(token);
      if (!isQuantityToken(token) && !STOP_WORDS.has(token)) hasContent = true;
    }

    if (cur.length) segments.push(cur.join(' '));
  }

  return segments.map((s) => s.trim()).filter(Boolean);
}

function parseQuantity(segment) {
  const normalized = normalize(segment);
  const tokens = normalized.split(' ').filter(Boolean);
  for (const token of tokens.slice(0, 5)) {
    if (/^\d+$/.test(token)) return Math.max(1, Math.min(99, Number(token)));
    if (QUANTITY_WORDS.has(token)) return QUANTITY_WORDS.get(token);
  }
  return 1;
}

function extractNotes(segment) {
  const match = String(segment || '').match(NOTE_RE);
  if (!match || match.index === undefined) return '';
  return String(segment).slice(match.index).trim().slice(0, 200);
}

function textBeforeNotes(segment) {
  const match = String(segment || '').match(NOTE_RE);
  if (!match || match.index === undefined) return segment;
  return String(segment).slice(0, match.index);
}

function scoreItem(segment, item) {
  const candidateTokens = tokenize(textBeforeNotes(segment)).filter(
    (token) => !QUANTITY_WORDS.has(token) && !/^\d+$/.test(token)
  );
  if (candidateTokens.length === 0) return 0;

  const itemTokens = tokenize(item.name);
  if (itemTokens.length === 0) return 0;

  const candidateText = ` ${candidateTokens.join(' ')} `;
  const itemText = ` ${itemTokens.join(' ')} `;
  if (candidateText.includes(itemText)) return 120 + itemTokens.length;

  let exact = 0;
  let prefix = 0;
  for (const itemToken of itemTokens) {
    if (candidateTokens.includes(itemToken)) {
      exact += 1;
      continue;
    }
    if (
      itemToken.length >= 4 &&
      candidateTokens.some((token) => itemToken.startsWith(token) || token.startsWith(itemToken))
    ) {
      prefix += 1;
    }
  }

  const coverage = (exact + prefix * 0.75) / itemTokens.length;
  const singleStrong =
    exact + prefix > 0 && itemTokens.some((token) => token.length >= 4 && candidateTokens.includes(token));

  return Math.round(coverage * 100) + (singleStrong ? 12 : 0);
}

function toProduct(item) {
  return {
    id: item.id,
    name: item.name,
    price: Number(item.price || 0),
    category: item.category?.name || '',
    categoryId: item.categoryId || item.category?.id || undefined,
    imageUrl: item.imageUrl || null,
    isPromo: !!item.isPromo,
    isPopular: !!item.isPopular,
    isFavorite: !!item.isFavorite,
    isAvailable: item.isAvailable !== false,
    activeDays: Array.isArray(item.activeDays) ? item.activeDays : [],
    promoPrice: item.promoPrice == null ? null : Number(item.promoPrice),
    hasVariants: !!item.hasVariants,
    variantMultiSelect: !!item.variantMultiSelect,
    variantMinSelection: item.variantMinSelection ?? 0,
    variantMaxSelection: item.variantMaxSelection ?? 0,
    variants: item.variants || [],
    complements: item.complements || [],
    modifierGroups: item.modifierGroups || [],
  };
}

function computeNeedsReview(product) {
  return (
    Boolean(product.hasVariants && product.variants.length > 0) ||
    Boolean(product.modifierGroups?.some((group) => group.required)) ||
    Boolean(product.complements?.length)
  );
}

async function loadCatalog(restaurantId) {
  return prisma.menuItem.findMany({
    where: { restaurantId, isAvailable: true },
    include: {
      category: { select: { id: true, name: true } },
      modifierGroups: { include: { modifiers: true } },
      variants: { where: { isAvailable: true }, orderBy: { sortOrder: 'asc' } },
      complements: { where: { isAvailable: true }, orderBy: { sortOrder: 'asc' } },
    },
    orderBy: [{ isFavorite: 'desc' }, { isPopular: 'desc' }, { name: 'asc' }],
  });
}

function emptyCatalogResult(prompt) {
  return {
    ok: false,
    items: [],
    unresolved: [String(prompt || '').trim()].filter(Boolean),
    message: 'No hay productos disponibles en el menu.',
    engine: 'rules',
  };
}

function buildMessage(items) {
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  return items.length > 0
    ? `${count} producto${count === 1 ? '' : 's'} agregado${count === 1 ? '' : 's'} al ticket.`
    : 'No encontre productos del menu en el dictado.';
}

/* ── NIVEL 1 — Parser de reglas (gratis, sin IA) ─────────────────────────── */

async function runOrderDictation({ prompt, restaurantId, catalog: preloaded }) {
  if (!prompt?.trim()) {
    const err = new Error('prompt requerido');
    err.code = 'BAD_REQUEST';
    throw err;
  }
  if (!restaurantId) {
    const err = new Error('restaurantId requerido');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const catalog = preloaded || (await loadCatalog(restaurantId));
  if (catalog.length === 0) return emptyCatalogResult(prompt);

  const items = [];
  const unresolved = [];

  for (const segment of splitPrompt(prompt)) {
    let best = null;
    let bestScore = 0;
    for (const item of catalog) {
      const score = scoreItem(segment, item);
      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    }

    if (!best || bestScore < 45) {
      unresolved.push(segment);
      continue;
    }

    const product = toProduct(best);
    items.push({
      menuItemId: best.id,
      quantity: parseQuantity(segment),
      notes: extractNotes(segment),
      confidence: Math.min(1, Number((bestScore / 120).toFixed(2))),
      needsReview: computeNeedsReview(product),
      product,
    });
  }

  return {
    ok: items.length > 0,
    items,
    unresolved,
    message: buildMessage(items),
    engine: 'rules',
  };
}

/* ── NIVEL 2 — Parser con IA (Groq Llama, solo BYOK del cliente) ──────────── */

const AI_SYSTEM_PROMPT = `Eres un parser de pedidos para el punto de venta de un restaurante.
Recibes un MENÚ numerado y el DICTADO de voz del cajero. Tu trabajo es identificar
qué productos del menú pidió, con su cantidad y notas.

Devuelve EXCLUSIVAMENTE un JSON válido con esta forma exacta:
{"items":[{"n":<numero del menu>,"quantity":<entero>,"notes":"<texto>"}],"unresolved":["<frase no reconocida>"]}

Reglas:
- "n" debe ser el número del MENÚ que mejor corresponde, aunque lo digan con nombre
  coloquial, abreviado o con errores de transcripción. NUNCA inventes un número fuera del menú.
- "quantity" es entero >= 1 (por defecto 1).
- "notes" sólo para indicaciones del platillo (ej. "sin cebolla", "extra queso", "bien dorado"); si no hay, usa "".
- Si una parte del dictado no corresponde a ningún producto del menú, agrégala a "unresolved".
- No incluyas explicaciones ni texto fuera del JSON.`;

function buildMenuList(catalog) {
  return catalog
    .map((it, i) => {
      const cat = it.category?.name ? ` [${it.category.name}]` : '';
      return `${i + 1}. ${it.name}${cat}`;
    })
    .join('\n');
}

async function runOrderDictationAI({ prompt, restaurantId, apiKey, catalog: preloaded, model }) {
  const catalog = preloaded || (await loadCatalog(restaurantId));
  if (catalog.length === 0) return emptyCatalogResult(prompt);

  const client = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  const userMsg = `MENÚ:\n${buildMenuList(catalog)}\n\nDICTADO: "${String(prompt).trim()}"`;

  const completion = await client.chat.completions.create({
    // Modelo configurable: el dictado por voz usa el default (GROQ_MODEL, 8b,
    // más rápido); WhatsApp pasa el 70b para mejor matching de pedidos escritos.
    model: model || GROQ_MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: AI_SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
  });

  const raw = completion?.choices?.[0]?.message?.content || '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const err = new Error('Respuesta de IA no es JSON válido');
    err.code = 'AI_BAD_JSON';
    throw err;
  }

  const items = [];
  const unresolved = Array.isArray(parsed?.unresolved)
    ? parsed.unresolved.map((u) => String(u)).filter(Boolean)
    : [];

  for (const row of Array.isArray(parsed?.items) ? parsed.items : []) {
    const n = Number(row?.n);
    if (!Number.isInteger(n) || n < 1 || n > catalog.length) continue; // anti-alucinación
    const best = catalog[n - 1];
    const product = toProduct(best);
    const quantity = Math.max(1, Math.min(99, Number(row?.quantity) || 1));
    const notes = String(row?.notes || '').slice(0, 200);
    items.push({
      menuItemId: best.id,
      quantity,
      notes,
      confidence: 0.95,
      needsReview: computeNeedsReview(product),
      product,
    });
  }

  return {
    ok: items.length > 0,
    items,
    unresolved,
    message: buildMessage(items),
    engine: 'ai',
  };
}

/* ── Orquestador — IA si el cliente trae su key (BYOK), si no reglas ──────── */

async function runOrderDictationSmart({ prompt, restaurantId, model }) {
  if (!prompt?.trim()) {
    const err = new Error('prompt requerido');
    err.code = 'BAD_REQUEST';
    throw err;
  }
  if (!restaurantId) {
    const err = new Error('restaurantId requerido');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  // El modo IA sólo se activa si el restaurante registró su PROPIA Groq key
  // (BYOK, free tier del cliente). Así el costo/cuota es por-tenant y la
  // plataforma no paga IA al escalar. Sin key → parser de reglas (gratis).
  let keyInfo = null;
  try {
    keyInfo = await resolveGroqKey({ restaurantId });
  } catch {
    keyInfo = null;
  }

  if (keyInfo?.source === 'customer' && keyInfo.apiKey) {
    try {
      const catalog = await loadCatalog(restaurantId);
      if (catalog.length === 0) return emptyCatalogResult(prompt);
      const ai = await runOrderDictationAI({ prompt, restaurantId, apiKey: keyInfo.apiKey, catalog, model });
      if (ai.ok) return ai;
      // IA no resolvió nada → intentar reglas sobre el mismo catálogo.
      const rules = await runOrderDictation({ prompt, restaurantId, catalog });
      return rules.ok ? rules : ai; // devolver el que tenga algo (o el de IA con su unresolved)
    } catch (err) {
      console.error('[order-dictation] IA falló, fallback a reglas:', err?.message || err);
      // Fallback robusto: nunca rompemos el dictado por un fallo de IA.
    }
  }

  return runOrderDictation({ prompt, restaurantId });
}

module.exports = {
  runOrderDictation,
  runOrderDictationAI,
  runOrderDictationSmart,
  normalize,
  splitPrompt,
  parseQuantity,
  scoreItem,
};
