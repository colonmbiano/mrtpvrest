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

function findMentionedOptions(segment, options, { multiple = false, max = 0 } = {}) {
  const ranked = (options || [])
    .map((option) => ({ option, score: scoreItem(segment, option) }))
    .filter(({ score }) => score >= 100)
    .sort((a, b) => b.score - a.score || b.option.name.length - a.option.name.length);

  if (!multiple) return ranked.slice(0, 1).map(({ option }) => option);
  return ranked.slice(0, max > 0 ? max : ranked.length).map(({ option }) => option);
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
  if (variantMultiSelect) {
    unitPrice += selectedVariants.reduce((sum, option) => sum + Number(option.price || 0), 0);
  }

  return {
    selectedVariant,
    selectedVariants: variantMultiSelect ? selectedVariants : [],
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
    items.push({
      menuItemId: best.id,
      quantity: parseQuantity(segment),
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
    // La IA dedujo variante/opciones del texto → resolvemos a IDs reales.
    const sel = resolveSelections(product, row?.variant, row?.modifiers);
    items.push({
      menuItemId: best.id,
      quantity,
      notes,
      variantId: sel.variantId,
      variantName: sel.variantName,
      modifierIds: sel.modifierIds,
      modifierNames: sel.modifierNames,
      confidence: 0.95,
      // Solo marca review si AÚN falta algo obligatorio tras resolver.
      needsReview: needsReviewAfterResolve(product, sel.variantId, sel.modifierIds),
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
  resolveSpokenSelections,
};
