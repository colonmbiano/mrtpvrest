import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { parseTestCatalog } from '../src/lib/marketplace-test-order.ts';
// Igual que marketplace.test.mjs: resolver imports TS relativos sin extensión.
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (/^\\.\\.?\\//.test(specifier) && !/\\.[cm]?[jt]sx?$/.test(specifier)) {
      return next(specifier + '.ts', context);
    }
    return next(specifier, context);
  }
`)}`);
const { normalizeMultiCart, quoteMultiTestOrder } =
  await import('../src/lib/marketplace-multi-order.ts');

const master = parseTestCatalog('master-burguer-s',
  { name: 'Master Burguer’s', slug: 'master-burguer-s' },
  { categories: [{ id: 'a', name: 'Hamburguesas' }], items: [{
    id: 'm1', name: 'Hamburguesa', price: 250, isPromo: true, promoPrice: 199,
    categoryId: 'a', variants: [], modifierGroups: [],
  }] });
const tokki = parseTestCatalog('tokki-bobba',
  { name: 'Tokki Boba', slug: 'tokki-bobba' },
  { categories: [{ id: 'b', name: 'Bebidas' }], items: [{
    id: 't1', name: 'Matcha Milk Tea', price: 60, categoryId: 'b',
    variants: [{ id: 'v12', name: '12 oz', price: 60 }, { id: 'v16', name: '16 oz', price: 70 }],
    modifierGroups: [{ id: 'g', name: 'Topping', minSelection: 0, maxSelection: 1,
      required: false, multiSelect: false,
      modifiers: [{ id: 'tapioca', name: 'Tapioca', priceAdd: 15, isAvailable: true }] }],
  }] });
const selection = [
  { slug: 'tokki-bobba', productId: 't1', variantId: 'v12', modifierIds: ['tapioca'], quantity: 2, priceCents: 1 },
  { slug: 'master-burguer-s', productId: 'm1', modifierIds: [], quantity: 1, priceCents: 1 },
];
const fetchCatalog = async slug => slug === 'tokki-bobba' ? tokki : master;

test('one checkout contains independent orders per merchant, both subtotals match server catalog', async () => {
  const result = await quoteMultiTestOrder(selection, fetchCatalog);
  assert.equal(result.stores.length, 2);
  assert.equal(result.totalCents, 34900);
  assert.deepEqual(result.stores.map(s => [s.slug, s.subtotalCents]),
    [['master-burguer-s', 19900], ['tokki-bobba', 15000]]);
  assert.equal(result.stores[1].lines[0].variant, '12 oz');
  assert.deepEqual(result.stores[1].lines[0].modifiers, ['Tapioca']);
});

test('checkout still works with only one store', async () => {
  const result = await quoteMultiTestOrder([selection[0]], fetchCatalog);
  assert.deepEqual(result.stores.map(s => s.slug), ['tokki-bobba']);
  assert.equal(result.totalCents, 15000);
});

test('store normalization ignores input order and blocks unknown merchant', () => {
  assert.deepEqual(normalizeMultiCart(selection).slugs, ['master-burguer-s', 'tokki-bobba']);
  assert.throws(() => normalizeMultiCart([{ ...selection[0], slug: 'other-shop' }]),
    e => e.code === 'TIENDA_INVALIDA');
  assert.throws(() => normalizeMultiCart([]), e => e.code === 'CARRITO_INVALIDO');
});

test('a missing product or invalid quantity in either shop aborts entire checkout', async () => {
  await assert.rejects(
    quoteMultiTestOrder([selection[0], { ...selection[1], productId: 'wrong' }], fetchCatalog),
    e => e.code === 'PRODUCTO_NO_DISPONIBLE');
  await assert.rejects(
    quoteMultiTestOrder([selection[0], { ...selection[1], quantity: 999 }], fetchCatalog),
    e => e.code === 'CANTIDAD_INVALIDA');
});

test('a catalog fetch failure prevents creating any grouped order', async () => {
  await assert.rejects(
    quoteMultiTestOrder(selection, async slug => {
      if (slug === 'master-burguer-s') throw new Error('unavailable');
      return tokki;
    }), /unavailable/);
});

test('server rejects cross-store product substitution and client supplied amount', async () => {
  await assert.rejects(quoteMultiTestOrder([
    { ...selection[0], productId: 'm1' }, selection[1],
  ], fetchCatalog), e => e.code === 'PRODUCTO_NO_DISPONIBLE');
  const valid = await quoteMultiTestOrder(selection, fetchCatalog);
  assert.equal(valid.totalCents, 34900);
});

test('per-store line validation blocks repeated rows and >15 lines per merchant', async () => {
  await assert.rejects(quoteMultiTestOrder([selection[0], selection[0]], fetchCatalog),
    e => e.code === 'LINEA_DUPLICADA');
  await assert.rejects(quoteMultiTestOrder(
    Array.from({ length: 16 }, () => selection[0]), fetchCatalog),
  e => e.code === 'CARRITO_INVALIDO');
});
