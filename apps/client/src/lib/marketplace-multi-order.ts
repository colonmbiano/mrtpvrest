/**
 * Agregado de una compra de prueba multi-tienda.
 * Ningún pedido toca bases, KDS, repartidores o medios de pago reales.
 * Un checkout -> compra padre + una orden hija por tienda.
 */
import {
  TEST_STORES, getPublicTestCatalog, priceTestOrder, TestOrderError,
  type TestOrderLine, type TestSelection, type TestStoreSlug, type TestStore,
} from './marketplace-test-order';

export type MultiTestCheckoutItem = {
  slug: TestStoreSlug; productId: string; variantId?: string;
  modifierIds: string[]; quantity: number;
};
export type MultiTestChildOrder = {
  id: string; slug: TestStoreSlug; storeName: string;
  status: 'TEST_CREATED'; lines: TestOrderLine[]; subtotalCents: number;
};
export type MultiTestOrder = {
  id: string; createdAt: string; status: 'TEST_CREATED';
  pickup: true; deliveryCents: null; payment: 'TEST_NO_CHARGE';
  totalCents: number; orders: MultiTestChildOrder[];
};
type FetchCatalog = (slug: TestStoreSlug) => Promise<TestStore>;

export function normalizeMultiCart(items: unknown): {
  slugs: TestStoreSlug[];
  selections: Map<TestStoreSlug, TestSelection[]>;
} {
  if (!Array.isArray(items) || !items.length || items.length > 25) {
    throw new TestOrderError('CARRITO_INVALIDO');
  }
  const selections = new Map<TestStoreSlug, TestSelection[]>();
  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new TestOrderError('PRODUCTO_INVALIDO');
    }
    const row = raw as Record<string, unknown>;
    if (typeof row.slug !== 'string' || !TEST_STORES.some(slug => slug === row.slug)) {
      throw new TestOrderError('TIENDA_INVALIDA');
    }
    const slug = row.slug as TestStoreSlug;
    const group = selections.get(slug) ?? [];
    group.push({
      productId: typeof row.productId === 'string' ? row.productId : '',
      ...(typeof row.variantId === 'string' ? { variantId: row.variantId } : {}),
      modifierIds: Array.isArray(row.modifierIds) ? row.modifierIds as string[] : [],
      quantity: typeof row.quantity === 'number' ? row.quantity : NaN,
    });
    selections.set(slug, group);
  }
  return { slugs: TEST_STORES.filter(s => selections.has(s)), selections };
}

export async function quoteMultiTestOrder(
  items: unknown,
  fetchCatalog: FetchCatalog = slug => getPublicTestCatalog(slug),
): Promise<{
  totalCents: number;
  stores: { slug: TestStoreSlug; storeName: string; subtotalCents: number; lines: TestOrderLine[] }[];
}> {
  const { slugs, selections } = normalizeMultiCart(items);
  // No persistir nada hasta obtener y validar todas las tiendas correctamente.
  const stores = await Promise.all(slugs.map(async slug => {
    const store = await fetchCatalog(slug);
    if (store.slug !== slug) throw new TestOrderError('TIENDA_INVALIDA');
    const { lines, totalCents } = priceTestOrder(store, selections.get(slug));
    return { slug, storeName: store.name, subtotalCents: totalCents, lines };
  }));
  const totalCents = stores.reduce((sum, store) => sum + store.subtotalCents, 0);
  if (totalCents > 10000000) throw new TestOrderError('TOTAL_EXCESIVO');
  return { stores, totalCents };
}
