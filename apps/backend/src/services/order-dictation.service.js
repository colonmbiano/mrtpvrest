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
  ['veintiuno', 21],
  ['veintidos', 22],
  ['veintitres', 23],
  ['veinticuatro', 24],
  ['veinticinco', 25],
  ['treinta', 30],
  ['cuarenta', 40],
  ['cincuenta', 50],
  // "docena"/"media docena" se resuelven en parseQuantity (compuestos), pero
  // dejamos el genérico aquí para "una docena" o "docena" suelto.
  ['docena', 12],
  ['docenas', 12],
]);

// Sinónimos de bebidas/comida y tallas coloquiales (México). Mapean lo que dice
// el cliente a los tokens CANÓNICOS que probablemente aparezcan en el nombre del
// producto/variante del menú. Solo amplían el matching del parser de reglas: si
// el nombre del producto NO contiene alguno de esos tokens, no hay match (no se
// inventan productos). El motor de IA ya maneja esto vía prompt; esto sube el
// nivel del parser GRATIS que usa la mayoría de tenants sin Groq key.
const SYNONYMS = new Map([
  // Refrescos / sodas
  ['coca', ['refresco', 'cocacola', 'cola', 'soda']],
  ['cocacola', ['refresco', 'coca', 'cola', 'soda']],
  ['refresco', ['soda', 'refresco']],
  ['chesco', ['refresco', 'soda']],
  ['soda', ['refresco']],
  ['sprite', ['refresco', 'soda']],
  ['fanta', ['refresco', 'soda']],
  ['manzanita', ['refresco', 'soda', 'manzana']],
  ['sidral', ['refresco', 'soda', 'manzana']],
  ['fresca', ['refresco', 'soda']],
  ['squirt', ['refresco', 'soda', 'toronja']],
  ['boing', ['jugo', 'refresco']],
  ['jarrito', ['refresco', 'soda']],
  ['jarritos', ['refresco', 'soda']],
  ['mundet', ['refresco', 'soda', 'manzana']],
  // Agua
  ['agua', ['agua']],
  ['aguita', ['agua']],
  // Cerveza
  ['cheve', ['cerveza']],
  ['chela', ['cerveza']],
  ['chelas', ['cerveza']],
  ['birra', ['cerveza']],
  ['caguama', ['cerveza', 'caguama']],
  ['caguamon', ['cerveza', 'caguama']],
  // Tallas / tamaños
  ['grande', ['grande', 'familiar']],
  ['grandes', ['grande', 'familiar']],
  ['familiar', ['familiar', 'grande']],
  ['jumbo', ['jumbo', 'grande']],
  ['mediano', ['mediano', 'mediana', 'medio']],
  ['mediana', ['mediana', 'mediano', 'medio']],
  ['media', ['mediana', 'mediano']],
  ['chico', ['chico', 'chica', 'individual', 'junior']],
  ['chica', ['chica', 'chico', 'individual', 'junior']],
  ['chicos', ['chico', 'chica', 'individual']],
  ['individual', ['individual', 'chico', 'junior']],
  ['junior', ['junior', 'chico', 'individual']],
]);

// Distancia de Levenshtein con tope (early-exit). Tolera errores de
// transcripción del STT ("hamburgesa"→"hamburguesa", "boneles"→"boneless").
function levenshtein(a, b, max) {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev = Array.from({ length: lb + 1 }, (_, i) => i);
  let cur = new Array(lb + 1);
  for (let i = 1; i <= la; i += 1) {
    cur[0] = i;
    let rowMin = cur[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j += 1) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1; // ninguna ruta puede mejorar bajo el tope
    [prev, cur] = [cur, prev];
  }
  return prev[lb];
}

// ¿`a` y `b` son casi iguales? Tope por longitud: 1 edición para palabras
// cortas (4-6), 2 para largas (>=7). Solo para tokens >=4 (evita ruido en
// palabras chiquitas como "te"/"de").
function fuzzyEqual(a, b) {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  const max = Math.max(a.length, b.length) >= 7 ? 2 : 1;
  return levenshtein(a, b, max) <= max;
}

// Expande un conjunto de tokens con sus sinónimos canónicos (sin duplicar).
function expandSynonyms(tokens) {
  const out = new Set(tokens);
  for (const token of tokens) {
    const syns = SYNONYMS.get(token);
    if (syns) for (const s of syns) out.add(s);
  }
  return out;
}

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
      // "media docena" / "medio docena" es una sola frase de cantidad: NO abrir
      // un segmento nuevo en "docena" si veníamos de "media/medio".
      const lastTok = cur[cur.length - 1];
      const isDozenAfterHalf =
        (token === 'docena' || token === 'docenas') &&
        (lastTok === 'media' || lastTok === 'medio');
      if (isQuantityToken(token) && hasContent && !isDozenAfterHalf) {
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

  // Conteo por docenas: "media docena" → 6, "una docena" → 12, "dos docenas" → 24.
  const dozenIdx = tokens.findIndex((t) => t === 'docena' || t === 'docenas');
  if (dozenIdx >= 0) {
    const prev = tokens[dozenIdx - 1];
    if (prev === 'media' || prev === 'medio') return 6;
    let mult = 1;
    if (prev && /^\d+$/.test(prev)) mult = Number(prev);
    else if (prev && QUANTITY_WORDS.has(prev) && QUANTITY_WORDS.get(prev) < 12) {
      mult = QUANTITY_WORDS.get(prev);
    }
    return Math.max(1, Math.min(99, mult * 12));
  }

  for (const token of tokens.slice(0, 5)) {
    if (/^\d+$/.test(token)) return Math.max(1, Math.min(99, Number(token)));
    if (QUANTITY_WORDS.has(token)) return QUANTITY_WORDS.get(token);
  }
  return 1;
}

const round3 = (x) => Math.round(x * 1000) / 1000;

function wordToNum(word) {
  if (/^\d+$/.test(word)) return Number(word);
  const map = {
    un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
    seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, medio: 0.5, media: 0.5,
  };
  return word in map ? map[word] : null;
}

// Interpreta el PESO dictado para productos vendidos por báscula (soldByWeight):
// "medio kilo"→0.5, "un kilo"/"kilo"→1, "kilo y medio"→1.5, "dos kilos"→2,
// "500 gramos"→0.5, "cuarto (de kilo)"→0.25, "tres cuartos"→0.75. Devuelve kg
// o null si no detecta una expresión de peso. (normalize() elimina puntos, así
// que sólo manejamos enteros + fracciones habladas — suficiente para báscula.)
function parseWeightKg(segment) {
  const t = normalize(segment);

  const grams = t.match(/(\d+)\s*(?:gramos|gramo|grs|gr)\b/);
  if (grams) {
    const kg = Number(grams[1]) / 1000;
    return kg > 0 ? round3(kg) : null;
  }

  // El resto requiere mención explícita de kilo(s)/kg para no confundir
  // "medio"/"cuarto" sueltos (que suelen ser otra cosa).
  if (!/\bkilos?\b|\bkilo\b|\bkg\b/.test(t)) return null;

  if (/\btres cuartos?\b/.test(t)) return 0.75;
  if (/\b(?:un )?cuarto\b/.test(t)) return 0.25;

  const m = t.match(
    /(\d+|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|medio|media)\s*(?:kilos?|kilo|kg)\b/,
  );
  let base = m ? wordToNum(m[1]) : 1; // "kilo" suelto → 1
  if (base == null) base = 1;

  if (/\by medio\b/.test(t)) base += 0.5;
  else if (/\by cuarto\b/.test(t)) base += 0.25;

  return base > 0 ? round3(base) : null;
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

  // Tokens candidatos + sinónimos canónicos (coca→refresco, grande→familiar…).
  const expanded = expandSynonyms(candidateTokens);

  let exact = 0;
  let prefix = 0;
  let fuzzy = 0;
  for (const itemToken of itemTokens) {
    if (expanded.has(itemToken)) {
      exact += 1;
      continue;
    }
    if (
      itemToken.length >= 4 &&
      candidateTokens.some((token) => itemToken.startsWith(token) || token.startsWith(itemToken))
    ) {
      prefix += 1;
      continue;
    }
    // Último recurso: casi-igual por errores de transcripción del STT.
    if (itemToken.length >= 4 && candidateTokens.some((token) => fuzzyEqual(token, itemToken))) {
      fuzzy += 1;
    }
  }

  const coverage = (exact + prefix * 0.75 + fuzzy * 0.6) / itemTokens.length;
  const singleStrong =
    exact > 0 && itemTokens.some((token) => token.length >= 4 && expanded.has(token));

  return Math.round(coverage * 100) + (singleStrong ? 12 : 0);
}

function findMentionedOptions(segment, options, { multiple = false, max = 0 } = {}) {
  const ranked = (options || [])
    .map((option) => ({ option, score: scoreItem(segment, option) }))
    .filter(({ score }) => score >= 100)
    .sort((a, b) => b.score - a.score || b.option.name.length - a.option.name.length);

  if (!multiple) return ranked.slice(0, 1).map(({ option }) => option);
  return ranked.slice(0, max > 0 ? max : ranked.length).map(({ option }) => option);
}

// Precio unitario = base (variante o promo o lista) + extras de modificadores
// (respetando freeModifiersLimit por grupo) + complementos + variantes
// multi-select. Compartido por el motor de reglas y el de IA para que el ticket
// reciba EXACTAMENTE el mismo precio sin importar qué motor resolvió el pedido.
function computeUnitPrice(
  product,
  { selectedVariant, selectedVariants = [], selectedModifiers = [], selectedComplements = [] }
) {
  let unitPrice = Number(selectedVariant?.price ?? product.promoPrice ?? product.price ?? 0);
  for (const group of product.modifierGroups || []) {
    const selected = selectedModifiers
      .filter((modifier) => modifier.groupId === group.id)
      .sort((a, b) => Number(a.priceAdd || 0) - Number(b.priceAdd || 0));
    selected.forEach((modifier, index) => {
      if (index >= Number(group.freeModifiersLimit || 0)) {
        unitPrice += Number(modifier.priceAdd || 0);
      }
    });
  }
  unitPrice += selectedComplements.reduce((sum, option) => sum + Number(option.price || 0), 0);
  unitPrice += selectedVariants.reduce((sum, option) => sum + Number(option.price || 0), 0);
  return unitPrice;
}

function resolveSpokenSelections(segment, product) {
  const availableVariants = (product.variants || []).filter((variant) => variant.isAvailable !== false);
  const variantMultiSelect = Boolean(product.variantMultiSelect);
  const selectedVariants = findMentionedOptions(segment, availableVariants, {
    multiple: variantMultiSelect,
    max: product.variantMaxSelection || 0,
  });
  const selectedVariant = variantMultiSelect ? null : selectedVariants[0] || null;

  const selectedModifiers = [];
  let needsReview = false;
  for (const group of product.modifierGroups || []) {
    const explicit = findMentionedOptions(segment, group.modifiers || [], {
      multiple: Boolean(group.multiSelect),
      max: group.maxSelection || 0,
    });
    const defaults = explicit.length === 0
      ? (group.modifiers || []).filter((modifier) => modifier.isDefault)
      : [];
    const selected = group.multiSelect
      ? [...explicit, ...defaults].slice(0, group.maxSelection > 0 ? group.maxSelection : undefined)
      : (explicit[0] || defaults[0] ? [explicit[0] || defaults[0]] : []);
    selectedModifiers.push(...selected);

    const minimum = Math.max(group.required ? 1 : 0, group.minSelection || 0);
    if (selected.length < minimum) needsReview = true;
  }

  const selectedComplements = findMentionedOptions(segment, product.complements || [], {
    multiple: true,
  });
  const requiredVariantCount = variantMultiSelect
    ? Math.max(0, product.variantMinSelection || 0)
    : availableVariants.length > 0
      ? 1
      : 0;
  if (selectedVariants.length < requiredVariantCount) needsReview = true;

  const resolvedVariants = variantMultiSelect ? selectedVariants : [];
  const unitPrice = computeUnitPrice(product, {
    selectedVariant,
    selectedVariants: resolvedVariants,
    selectedModifiers,
    selectedComplements,
  });

  return {
    selectedVariant,
    selectedVariants: resolvedVariants,
    selectedModifiers,
    selectedComplements,
    unitPrice,
    needsReview,
  };
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
    // Venta por peso: el frontend (hoja de revisión) necesita saber que el
    // precio es por kg para mostrar el editor de peso en vez del de cantidad.
    soldByWeight: !!item.soldByWeight,
    unit: item.unit || null,
    variants: item.variants || [],
    complements: item.complements || [],
    modifierGroups: item.modifierGroups || [],
  };
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
    const selections = resolveSpokenSelections(segment, product);
    // Producto por báscula: el número dictado es PESO (kg), no cantidad.
    const weightKg = product.soldByWeight ? parseWeightKg(segment) : null;
    items.push({
      menuItemId: best.id,
      quantity: weightKg ? 1 : parseQuantity(segment),
      weightKg,
      notes: extractNotes(segment),
      confidence: Math.min(1, Number((bestScore / 120).toFixed(2))),
      needsReview: selections.needsReview,
      selections,
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
Recibes un MENÚ numerado y el PEDIDO del cliente. Identifica qué productos pidió,
su cantidad y —cuando el producto lo permita— la VARIANTE y las OPCIONES elegidas.

Devuelve EXCLUSIVAMENTE un JSON válido con esta forma exacta:
{"items":[{"n":<numero del menu>,"quantity":<entero>,"variant":"<nombre de variante o vacío>","modifiers":["<nombre de opción>"],"notes":"<texto>"}],"unresolved":["<frase no reconocida>"]}

Reglas:
- "n" debe ser el número del MENÚ que mejor corresponde, aunque lo digan con nombre
  coloquial, abreviado o con errores de transcripción. NUNCA inventes un número fuera del menú.
- Las MARCAS y nombres coloquiales de bebida (coca, coca-cola, sprite, fanta, manzanita,
  sidral, boing, jarrito, soda, agua, michelada, caguama, etc.) corresponden al producto
  GENÉRICO del menú más cercano (ej. "Refrescos", "Agua", "Cerveza", "Micheladas"). Si hay
  varias presentaciones del mismo genérico, elige la más común (lata/600ml/menor tamaño)
  salvo que el cliente especifique envase o litraje.
- Prefiere asignar el producto genérico más razonable antes que dejarlo sin resolver: sólo
  usa "unresolved" cuando de verdad NO exista nada parecido en el menú. Palabras que claramente
  no son comida/bebida (colonias, direcciones, saludos) sí van a "unresolved".
- "quantity" es entero >= 1 (por defecto 1).
- VARIANTES: si el producto lista "variantes:", pon en "variant" el NOMBRE EXACTO de la
  variante pedida (mapea coloquialismos: "grande"→"Grande", "chico"→"Chico", "media"→"Mediana").
  Si el cliente NO especifica variante, deja "variant":"" (no inventes una).
- OPCIONES/MODIFICADORES: si el producto lista grupos de opciones o complementos, pon en
  "modifiers" los NOMBRES EXACTOS de las opciones pedidas (ej. "con queso extra"→"Queso extra").
  Usa SÓLO opciones LISTADAS para ESE producto. Si no pidió ninguna, deja "modifiers":[].
- "variant" y cada valor de "modifiers" deben coincidir con un valor que aparezca en la lista
  de ESE producto; nunca inventes opciones que no estén listadas.
- "notes" sólo para indicaciones libres que NO sean una variante ni una opción del menú
  (ej. "bien dorado", "sin cebolla" cuando no exista como opción); si no hay, usa "".
- No incluyas explicaciones ni texto fuera del JSON.`;

function buildMenuList(catalog) {
  return catalog
    .map((it, i) => {
      const cat = it.category?.name ? ` [${it.category.name}]` : '';
      let line = `${i + 1}. ${it.name}${cat}`;
      // Variantes y opciones se listan debajo del producto para que el modelo
      // pueda elegir SOLO entre las disponibles de ESE producto (resolución
      // exacta por nombre en resolveSelections; nada de inventar opciones).
      const variants = (it.variants || []).filter((v) => v.isAvailable !== false);
      if (variants.length) {
        line += `\n   variantes: ${variants.map((v) => v.name).join(' | ')}`;
      }
      for (const g of it.modifierGroups || []) {
        const mods = (g.modifiers || []).filter((m) => m.isAvailable !== false);
        if (!mods.length) continue;
        const req = g.required ? ' (obligatorio)' : '';
        line += `\n   ${g.name || 'opciones'}${req}: ${mods.map((m) => m.name).join(' | ')}`;
      }
      const comps = (it.complements || []).filter((c) => c.isAvailable !== false);
      if (comps.length) {
        line += `\n   complementos: ${comps.map((c) => c.name).join(' | ')}`;
      }
      return line;
    })
    .join('\n');
}

// ¿Tras intentar resolver desde el texto, aún falta una selección OBLIGATORIA?
// (producto con variantes pero sin variante elegida, o grupo de modificadores
// "required" sin ninguna opción). Si sí, el cajero debe completarlo en el TPV.
function needsReviewAfterResolve(product, variantId, modifierIds) {
  if (product.hasVariants && (product.variants || []).length && !variantId) return true;
  const selected = new Set(modifierIds || []);
  for (const g of product.modifierGroups || []) {
    if (g.required && !(g.modifiers || []).some((m) => selected.has(m.id))) return true;
  }
  return false;
}

// Resuelve los nombres que devolvió la IA (variante y opciones) a IDs reales del
// producto: match por nombre normalizado (exacto, luego por inclusión). Los
// complementos se marcan con el prefijo "complement:" (mismo convenio que el TPV
// y que POST /api/store/orders).
function resolveSelections(product, rawVariant, rawModifiers) {
  const byName = (list, want) =>
    list.find((x) => normalize(x.name) === want) ||
    list.find((x) => {
      const n = normalize(x.name);
      return n && (n.includes(want) || want.includes(n));
    });

  let variantId = null;
  let variantName = null;
  const wantV = normalize(rawVariant || '');
  if (wantV && (product.variants || []).length) {
    const v = byName(product.variants, wantV);
    if (v) { variantId = v.id; variantName = v.name; }
  }
  // Variante ÚNICA (ej. "Unidad", "Papas", "1 Litro", "Porción"): no hay
  // ambigüedad y el cliente no la menciona → la elegimos sola, para que el
  // precio sea el correcto y no se marque review en falso.
  if (!variantId && (product.variants || []).length === 1) {
    variantId = product.variants[0].id;
    variantName = product.variants[0].name;
  }

  const modifierIds = [];
  const modifierNames = [];
  const allMods = (product.modifierGroups || []).flatMap((g) => g.modifiers || []);
  const allComps = product.complements || [];
  for (const raw of Array.isArray(rawModifiers) ? rawModifiers : []) {
    const want = normalize(raw);
    if (!want) continue;
    const m = byName(allMods, want);
    if (m) { modifierIds.push(m.id); modifierNames.push(m.name); continue; }
    const c = byName(allComps, want);
    if (c) { modifierIds.push(`complement:${c.id}`); modifierNames.push(c.name); }
  }
  return { variantId, variantName, modifierIds, modifierNames };
}

// Construye el shape `selections` (el MISMO que devuelve el motor de reglas) a
// partir de los IDs ya resueltos por la IA. CRÍTICO: el frontend del dictado
// (VoiceOrderDictation) sólo lee `item.selections`; sin esto, las variantes y
// modificadores que la IA sí resolvió se perderían al pasar al ticket.
function buildSelectionsFromResolved(product, variantId, modifierIds) {
  const allMods = (product.modifierGroups || []).flatMap((group) =>
    (group.modifiers || []).map((m) => ({ ...m, groupId: m.groupId || group.id }))
  );

  let selectedVariant = null;
  if (variantId) {
    const v = (product.variants || []).find((x) => x.id === variantId);
    if (v) selectedVariant = { id: v.id, name: v.name, price: Number(v.price || 0) };
  }

  const selectedModifiers = [];
  const selectedComplements = [];
  for (const id of Array.isArray(modifierIds) ? modifierIds : []) {
    if (typeof id === 'string' && id.startsWith('complement:')) {
      const cid = id.slice('complement:'.length);
      const c = (product.complements || []).find((x) => x.id === cid);
      if (c) selectedComplements.push({ id: c.id, name: c.name, price: Number(c.price || 0) });
      continue;
    }
    const m = allMods.find((x) => x.id === id);
    if (m) {
      selectedModifiers.push({
        id: m.id,
        groupId: m.groupId,
        name: m.name,
        priceAdd: Number(m.priceAdd || 0),
      });
    }
  }

  const unitPrice = computeUnitPrice(product, {
    selectedVariant,
    selectedModifiers,
    selectedComplements,
  });

  return { selectedVariant, selectedVariants: [], selectedModifiers, selectedComplements, unitPrice };
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
    // Producto por báscula: intentamos leer el peso del prompt completo
    // (la IA devuelve cantidad, no kg). Best-effort: si hay varias líneas por
    // peso el cajero lo ajusta en la hoja de revisión.
    const weightKg = product.soldByWeight ? parseWeightKg(prompt) : null;
    // La IA dedujo variante/opciones del texto → resolvemos a IDs reales.
    const sel = resolveSelections(product, row?.variant, row?.modifiers);
    items.push({
      menuItemId: best.id,
      quantity: weightKg ? 1 : quantity,
      weightKg,
      notes,
      variantId: sel.variantId,
      variantName: sel.variantName,
      modifierIds: sel.modifierIds,
      modifierNames: sel.modifierNames,
      confidence: 0.95,
      // Solo marca review si AÚN falta algo obligatorio tras resolver.
      needsReview: needsReviewAfterResolve(product, sel.variantId, sel.modifierIds),
      // Mismo shape que el motor de reglas → el ticket recibe variante/
      // modificadores/precio igual sin importar qué motor resolvió.
      selections: buildSelectionsFromResolved(product, sel.variantId, sel.modifierIds),
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
  parseWeightKg,
  scoreItem,
  resolveSpokenSelections,
  resolveSelections,
  buildSelectionsFromResolved,
  computeUnitPrice,
  fuzzyEqual,
};
