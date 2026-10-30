import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTestStoreSlug, parseTestCatalog, priceTestOrder, getPublicTestCatalog,
} from '../src/lib/marketplace-test-order.ts';

const info = { slug: 'tokki-bobba', name: 'TOKKI BOBBA', logo: 'https://example.com/logo.png' };
const menu = {
  categories: [{ id: 'c1', name: 'Bebidas' }],
  items: [
    {
      id: 'matcha', name: 'Matcha Milk Tea', price: 60, categoryId: 'c1',
      variants: [{ id: '12', name: '12 oz', price: 60 }, { id: '16', name: '16 oz', price: 70 }],
      modifierGroups: [
        { id: 'g1', name: 'Primer topping', required: false, minSelection: 0,
          maxSelection: 1, multiSelect: false,
          modifiers: [{ id: 'tapioca', name: 'Tapioca', priceAdd: 15, isAvailable: true }] },
      ],
    },
    {
      id: 'panda', name: 'Panda', price: 80, categoryId: 'c1', variants: [],
      modifierGroups: [
        { id: 'g2', name: 'Preparación', required: true, minSelection: 1,
          maxSelection: 1, multiSelect: false,
          modifiers: [{ id: 'normal', name: 'Normal', priceAdd: 0, isAvailable: true },
            { id: 'no_disponible', name: 'Agotado', priceAdd: 0, isAvailable: false }] },
      ],
    },
  ],
};
const store = parseTestCatalog('tokki-bobba', info, menu);
const matcha = { productId: 'matcha', variantId: '12', modifierIds: ['tapioca'], quantity: 2 };
const raises = (lines, code) => assert.throws(
  () => priceTestOrder(store, lines), e => e.code === code,
);

test('Only allow designated public stores', () => {
  assert.equal(isTestStoreSlug('tokki-bobba'), true);
  assert.equal(isTestStoreSlug('master-burguer-s'), true);
  assert.equal(isTestStoreSlug('other-business'), false);
  assert.equal(isTestStoreSlug('../admin'), false);
});

test('Calculate server-side prices, variants and toppings in integer cents', () => {
  const order = priceTestOrder(store, [{ ...matcha, priceCents: 1, subtotal: 1 }]);
  assert.equal(order.totalCents, 15000);
  assert.equal(order.lines[0].unitCents, 7500);
  assert.equal(order.lines[0].lineCents, 15000);
  assert.deepEqual(order.lines[0].modifiers, ['Tapioca']);
  assert.equal(order.lines[0].variant, '12 oz');
});

test('Reject missing or invalid required modifiers, variants, quantities and foreign prices', () => {
  raises([{ ...matcha, variantId: undefined }], 'VARIANTE_REQUERIDA');
  raises([{ ...matcha, quantity: 999 }], 'CANTIDAD_INVALIDA');
  raises([{ ...matcha, modifierIds: ['fake'] }], 'MODIFICADOR_DESCONOCIDO');
  raises([{ ...matcha, modifierIds: ['tapioca', 'tapioca'] }], 'MODIFICADORES_DUPLICADOS');
  raises([{ ...matcha, productId: 'other-tenant' }], 'PRODUCTO_NO_DISPONIBLE');
  raises([{ productId: 'panda', quantity: 1, modifierIds: [] }], 'MODIFICADORES_REQUERIDOS');
  raises([{ productId: 'panda', quantity: 1, modifierIds: ['no_disponible'] }], 'MODIFICADORES_REQUERIDOS');
  const panda = priceTestOrder(store, [{ productId: 'panda', quantity: 1, modifierIds: ['normal'] }]);
  assert.equal(panda.totalCents, 8000);
});

test('Prevent duplicate rows and huge quantity arrays', () => {
  raises([matcha, matcha], 'LINEA_DUPLICADA');
  raises([], 'CARRITO_INVALIDO');
  raises(Array.from({length:16}, () => matcha), 'CARRITO_INVALIDO');
});

test('Public data only: four GETs not needed, no auth, no order POST', async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    const data = url.includes('/info?') ? info : menu;
    return { ok: true, json: async () => data };
  };
  const result = await getPublicTestCatalog('tokki-bobba', fetchImpl);
  assert.equal(result.products.length, 2);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(r => r.url.startsWith('https://api.mrtpvrest.com/api/store/')
    && r.init.method === 'GET' && r.init.credentials === 'omit'
    && !('Authorization' in r.init.headers)));
});

test('Use active published promo price, never base price in test receipt', () => {
  const promoMenu = { categories: [{ id: 'c1', name: 'Hamburguesas' }], items: [
    { id: 'casera', name: 'Hamburguesa casera', categoryId: 'c1',
      price: 250, isPromo: true, promoPrice: 199, variants: [], modifierGroups: [] },
  ] };
  const promoStore = parseTestCatalog('master-burguer-s',
    { slug: 'master-burguer-s', name: 'Master Burguer’s' }, promoMenu);
  const order = priceTestOrder(promoStore,
    [{ productId: 'casera', quantity: 1, modifierIds: [], priceCents: 1 }]);
  assert.equal(order.totalCents, 19900);
});

test('Unsupported combos or impossible required modifier groups cannot be ordered', () => {
  const broken = { categories: [], items: [
    { id: 'combo', name: 'Combo', price: 100, isCombo: true, variants: [] },
    { id: 'required', name: 'Required', price: 100,
      modifierGroups: [{ id: 'req', name: 'Agotado', required: true, minSelection: 1,
        maxSelection: 1, multiSelect: false,
        modifiers: [{ id: 'none', name: 'Sin stock', priceAdd: 0, isAvailable: false }] }] },
  ] };
  const invalid = parseTestCatalog('tokki-bobba', info, broken);
  assert.ok(invalid.products.every(p => p.unsupported));
  for(const product of invalid.products) assert.throws(() =>
    priceTestOrder(invalid, [{ productId: product.id, quantity: 1, modifierIds: [] }]),
  e => e.code === 'PRODUCTO_NO_DISPONIBLE');
});
