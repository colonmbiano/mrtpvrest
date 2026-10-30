/**
 * Checkout LOCAL de primera orden de prueba.
 * Fuente publica solo GET, estrictamente dos comercios.
 * No reutilizar esto para pedidos reales: no integra KDS, TPV, caja o delivery.
 */
export const TEST_STORES = ['master-burguer-s', 'tokki-bobba'] as const;
export type TestStoreSlug = typeof TEST_STORES[number];
export type TestVariant = { id: string; name: string; priceCents: number };
export type TestModifier = { id: string; name: string; priceCents: number };
export type TestGroup = {
  id: string; name: string; min: number; max: number; options: TestModifier[];
};
export type TestProduct = {
  id: string; name: string; description: string; imageUrl?: string;
  category: string; priceCents: number; variants: TestVariant[];
  groups: TestGroup[]; unsupported: boolean;
};
export type TestStore = { slug: TestStoreSlug; name: string; logoUrl?: string; products: TestProduct[] };
export type TestSelection = {
  productId: string; variantId?: string; modifierIds: string[]; quantity: number;
};
export type TestOrderLine = {
  productId: string; name: string; variant: string | null;
  modifiers: string[]; quantity: number; unitCents: number; lineCents: number;
};
export type TestOrder = {
  id: string; slug: TestStoreSlug; storeName: string;
  status: 'TEST_CREATED'; pickup: true; totalCents: number;
  createdAt: string; lines: TestOrderLine[];
};

const record = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown, max = 150): string =>
  typeof x === 'string' ? x.trim().slice(0, max) : '';
const cents = (x: unknown): number | null => {
  if (typeof x !== 'number' && (typeof x !== 'string' || !/^\d+(\.\d{1,2})?$/.test(x))) return null;
  const number = Number(x);
  if (!Number.isFinite(number) || number < 0 || number > 100000) return null;
  return Math.round(number * 100);
};
const urlImage = (x: unknown): string | undefined => {
  if (typeof x !== 'string' || x.length > 2048) return undefined;
  try {
    const url = new URL(x);
    return url.protocol === 'https:' && !url.username && !url.password ? x : undefined;
  } catch { return undefined; }
};

export function isTestStoreSlug(x: string): x is TestStoreSlug {
  return TEST_STORES.some(s => s === x);
}

export function parseTestCatalog(slug: TestStoreSlug, rawInfo: unknown, rawMenu: unknown): TestStore {
  if (!record(rawInfo) || rawInfo.slug !== slug || !str(rawInfo.name)
    || !record(rawMenu) || !Array.isArray(rawMenu.categories) || !Array.isArray(rawMenu.items)
    || rawMenu.items.length > 400) {
    throw new Error('CATALOG_UNAVAILABLE');
  }
  const categories = new Map<string, string>();
  for (const row of rawMenu.categories) {
    if (record(row) && str(row.id) && str(row.name)) categories.set(str(row.id), str(row.name));
  }
  const products: TestProduct[] = [];
  for (const row of rawMenu.items) {
    if (!record(row) || !str(row.id) || !str(row.name)) continue;
    const price = cents(row.price);
    const variants: TestVariant[] = Array.isArray(row.variants) ? row.variants.filter(record)
      .map(v => ({ id: str(v.id), name: str(v.name), priceCents: cents(v.price) ?? -1 }))
      .filter(v => v.id && v.name && v.priceCents > 0) : [];
    if ((price === null || price === 0) && variants.length === 0) continue;
    const groups: TestGroup[] = [];
    if (Array.isArray(row.modifierGroups)) for (const group of row.modifierGroups) {
      if (!record(group) || !str(group.id)) continue;
      const options: TestModifier[] = Array.isArray(group.modifiers) ? group.modifiers.filter(record)
        .filter(m => m.isAvailable === true)
        .map(m => ({ id: str(m.id), name: str(m.name), priceCents: cents(m.priceAdd) ?? -1 }))
        .filter(m => m.id && m.name && m.priceCents >= 0) : [];
      const multi = group.multiSelect === true;
      const requestedMin = Number.isInteger(group.minSelection) ? Number(group.minSelection) : 0;
      const min = group.required === true ? Math.max(1, requestedMin) : Math.max(0, requestedMin);
      const requestedMax = Number.isInteger(group.maxSelection) && Number(group.maxSelection) > 0
        ? Number(group.maxSelection) : 1;
      const max = multi ? requestedMax : 1;
      groups.push({ id: str(group.id), name: str(group.name) || 'Elige tus opciones', min, max, options });
    }
    const promo = row.isPromo === true && variants.length === 0 ? cents(row.promoPrice) : null;
    const base = price ?? 0;
    const product: TestProduct = {
      id: str(row.id), name: str(row.name), description: str(row.description, 300),
      ...(urlImage(row.imageUrl) ? { imageUrl: urlImage(row.imageUrl) } : {}),
      category: categories.get(str(row.categoryId)) || 'Menú',
      priceCents: promo !== null && promo < base ? promo : base,
      variants, groups,
      unsupported: row.isCombo === true || groups.some(g => g.min > g.options.length || g.max < g.min),
    };
    products.push(product);
  }
  return {
    slug, name: str(rawInfo.name),
    ...(urlImage(rawInfo.logo) ? { logoUrl: urlImage(rawInfo.logo) } : {}), products,
  };
}

export async function getPublicTestCatalog(
  slug: TestStoreSlug,
  fetchImpl: typeof fetch = fetch,
): Promise<TestStore> {
  const origin = 'https://api.mrtpvrest.com';
  const get = async (endpoint: 'info' | 'menu') => {
    const response = await fetchImpl(origin + '/api/store/' + endpoint + '?r=' + slug, {
      method: 'GET', cache: 'no-store', credentials: 'omit',
      signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('CATALOG_UNAVAILABLE');
    return response.json() as Promise<unknown>;
  };
  const [info, menu] = await Promise.all([get('info'), get('menu')]);
  return parseTestCatalog(slug, info, menu);
}

export class TestOrderError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code = code; }
}
export function priceTestOrder(store: TestStore, entries: unknown): { lines: TestOrderLine[]; totalCents: number } {
  if (!Array.isArray(entries) || !entries.length || entries.length > 15) {
    throw new TestOrderError('CARRITO_INVALIDO');
  }
  const seen = new Set<string>();
  const lines: TestOrderLine[] = [];
  for (const entry of entries) {
    if (!record(entry)) throw new TestOrderError('PRODUCTO_INVALIDO');
    const product = store.products.find(p => p.id === entry.productId);
    if (!product || product.unsupported) throw new TestOrderError('PRODUCTO_NO_DISPONIBLE');
    const quantity = entry.quantity;
    if (!Number.isInteger(quantity) || Number(quantity) < 1 || Number(quantity) > 10) {
      throw new TestOrderError('CANTIDAD_INVALIDA');
    }
    const variantId = typeof entry.variantId === 'string' ? entry.variantId : '';
    const variant = product.variants.find(v => v.id === variantId);
    if (product.variants.length && !variant) throw new TestOrderError('VARIANTE_REQUERIDA');
    if (!product.variants.length && variantId) throw new TestOrderError('VARIANTE_INVALIDA');
    if (!Array.isArray(entry.modifierIds) || entry.modifierIds.length > 35
      || entry.modifierIds.some(v => typeof v !== 'string')) throw new TestOrderError('MODIFICADORES_INVALIDOS');
    const requested = entry.modifierIds as string[];
    if (new Set(requested).size !== requested.length) throw new TestOrderError('MODIFICADORES_DUPLICADOS');
    const selected: string[] = [];
    let unitCents = variant ? variant.priceCents : product.priceCents;
    for (const group of product.groups) {
      const matches = group.options.filter(option => requested.includes(option.id));
      if (matches.length < group.min || matches.length > group.max) {
        throw new TestOrderError('MODIFICADORES_REQUERIDOS');
      }
      for (const modifier of matches) {
        selected.push(modifier.name);
        unitCents += modifier.priceCents;
      }
    }
    const ids = new Set(product.groups.flatMap(g => g.options.map(o => o.id)));
    if (requested.some(id => !ids.has(id))) throw new TestOrderError('MODIFICADOR_DESCONOCIDO');
    if (unitCents <= 0) throw new TestOrderError('PRECIO_NO_DISPONIBLE');
    const key = JSON.stringify([product.id, variantId, [...requested].sort()]);
    if (seen.has(key)) throw new TestOrderError('LINEA_DUPLICADA');
    seen.add(key);
    lines.push({
      productId: product.id, name: product.name, variant: variant?.name || null,
      modifiers: selected, quantity: Number(quantity), unitCents, lineCents: unitCents * Number(quantity),
    });
  }
  const totalCents = lines.reduce((sum, l) => sum + l.lineCents, 0);
  if (totalCents > 10000000) throw new TestOrderError('TOTAL_EXCESIVO');
  return { lines, totalCents };
}
