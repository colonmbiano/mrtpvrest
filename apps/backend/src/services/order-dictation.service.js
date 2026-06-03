const { prisma } = require('@mrtpvrest/database');

const QUANTITY_WORDS = new Map([
  ['un', 1],
  ['uno', 1],
  ['una', 1],
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
    .replace(/[\u0300-\u036f]/g, '')
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

function splitPrompt(prompt) {
  const qtyWords = [...QUANTITY_WORDS.keys()].join('|');
  const connectorBeforeQty = new RegExp(
    `\\s+(?:y|mas|tambien|aparte)\\s+(?=(?:${qtyWords}|\\d+)\\b)`,
    'gi'
  );
  return String(prompt || '')
    .replace(connectorBeforeQty, ', ')
    .split(/[.;,\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
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

async function runOrderDictation({ prompt, restaurantId }) {
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

  const catalog = await loadCatalog(restaurantId);
  if (catalog.length === 0) {
    return {
      ok: false,
      items: [],
      unresolved: [prompt.trim()],
      message: 'No hay productos disponibles en el menu.',
    };
  }

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
    const needsReview =
      Boolean(product.hasVariants && product.variants.length > 0) ||
      Boolean(product.modifierGroups?.some((group) => group.required)) ||
      Boolean(product.complements?.length);

    items.push({
      menuItemId: best.id,
      quantity: parseQuantity(segment),
      notes: extractNotes(segment),
      confidence: Math.min(1, Number((bestScore / 120).toFixed(2))),
      needsReview,
      product,
    });
  }

  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  return {
    ok: items.length > 0,
    items,
    unresolved,
    message:
      items.length > 0
        ? `${count} producto${count === 1 ? '' : 's'} agregado${count === 1 ? '' : 's'} al ticket.`
        : 'No encontre productos del menu en el dictado.',
  };
}

module.exports = {
  runOrderDictation,
  normalize,
  splitPrompt,
  parseQuantity,
  scoreItem,
};
