'use strict';

// C4: precio de variantes y modificadores del Mercadito, siempre del servidor.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { priceItemOptions } = require('../src/lib/marketplace-item-options');
const { createQuoteService, MarketplaceQuoteError } = require('../src/lib/marketplace-quote');

class OptionError extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status; } }
const check = (ok, code, message, status = 400) => { if (!ok) throw new OptionError(code, message, status); };
const rejects = (fn, code, status) => assert.throws(fn, error => error.code === code && (status === undefined || error.status === status));

const group = (extra = {}) => ({ id: 'g', name: 'Extras', required: false, multiSelect: true, minSelection: 0, maxSelection: 0,
  freeModifiersLimit: 0, groupType: 'ADD', modifiers: [
    { id: 'queso', name: 'Queso', priceAddCents: 1500, available: true },
    { id: 'tocino', name: 'Tocino', priceAddCents: 2000, available: true },
    { id: 'agotado', name: 'Aguacate', priceAddCents: 1000, available: false }], ...extra });
const listing = (extra = {}) => ({ name: 'Hamburguesa', unitPriceCents: 9900,
  variants: [{ id: 'doble', name: 'Doble', priceCents: 12900, available: true }, { id: 'triple', name: 'Triple', priceCents: 15900, available: false }],
  groups: [group()], ...extra });
const price = (selection, extra) => priceItemOptions(listing(extra), selection, check);

test('sin opciones, el precio es el del producto', () => {
  assert.deepEqual(price({}), { name: 'Hamburguesa', variantId: null, unitPriceCents: 9900, modifiers: [] });
});

test('la variante reemplaza el precio y se nombra en la línea; agotada o ajena se rechaza', () => {
  const doble = price({ variantId: 'doble' });
  assert.equal(doble.unitPriceCents, 12900); assert.equal(doble.name, 'Hamburguesa (Doble)'); assert.equal(doble.variantId, 'doble');
  rejects(() => price({ variantId: 'triple' }), 'OPTION_NOT_AVAILABLE', 409);
  rejects(() => price({ variantId: 'otra' }), 'OPTION_NOT_FOUND', 409);
});

test('los extras suman su precio; agotados o de otro producto se rechazan', () => {
  const result = price({ variantId: 'doble', modifierIds: ['tocino', 'queso'] });
  assert.equal(result.unitPriceCents, 12900 + 1500 + 2000);
  assert.deepEqual(result.modifiers.map(mod => [mod.modifierId, mod.priceAddCents]), [['queso', 1500], ['tocino', 2000]]);
  rejects(() => price({ modifierIds: ['agotado'] }), 'OPTION_NOT_AVAILABLE', 409);
  rejects(() => price({ modifierIds: ['de-otro-producto'] }), 'OPTION_NOT_FOUND', 409);
});

test('los primeros N del grupo son gratis, los más baratos primero', () => {
  const result = price({ modifierIds: ['tocino', 'queso'] }, { groups: [group({ freeModifiersLimit: 1 })] });
  assert.deepEqual(result.modifiers.map(mod => [mod.modifierId, mod.priceAddCents]), [['queso', 0], ['tocino', 2000]]);
  assert.equal(result.unitPriceCents, 9900 + 2000);
});

test('grupo obligatorio, mínimo, máximo y selección única se respetan', () => {
  rejects(() => price({}, { groups: [group({ required: true })] }), 'INVALID_OPTIONS', 422);
  rejects(() => price({ modifierIds: ['queso'] }, { groups: [group({ minSelection: 2 })] }), 'INVALID_OPTIONS', 422);
  rejects(() => price({ modifierIds: ['queso', 'tocino'] }, { groups: [group({ maxSelection: 1 })] }), 'INVALID_OPTIONS', 422);
  rejects(() => price({ modifierIds: ['queso', 'tocino'] }, { groups: [group({ multiSelect: false })] }), 'INVALID_OPTIONS', 422);
  assert.equal(price({ modifierIds: ['queso'] }, { groups: [group({ required: true, multiSelect: false })] }).unitPriceCents, 11400);
});

test('repetir una opción solo vale en grupos por cantidad, que se guardan compactos', () => {
  rejects(() => price({ modifierIds: ['queso', 'queso'] }), 'INVALID_OPTIONS', 422);
  const salsas = group({ id: 'salsas', name: 'Salsas', groupType: 'QUANTITY', maxSelection: 3, freeModifiersLimit: 1 });
  const result = price({ modifierIds: ['queso', 'queso', 'tocino'] }, { groups: [salsas] });
  assert.deepEqual(result.modifiers, [{ modifierId: 'queso', name: '2 Queso', priceAddCents: 1500 },
    { modifierId: 'tocino', name: '1 Tocino', priceAddCents: 2000 }]);
  assert.equal(result.unitPriceCents, 9900 + 3500);
  rejects(() => price({ modifierIds: ['queso', 'queso', 'queso', 'tocino'] }, { groups: [salsas] }), 'INVALID_OPTIONS', 422);
});

// ── cotización completa ──────────────────────────────────────────────────────
function quoteWorld() {
  const merchant = { id: 'm1', status: 'ACTIVE', open: true, currency: 'MXN', minOrderCents: 0, commissionBps: 1000, prepMinutes: 15 };
  const store = new Map();
  const catalog = { loadMerchant: async () => structuredClone(merchant),
    loadListings: async () => [{ merchantId: 'm1', menuItemId: 'burger', published: true, available: true, ...listing() }] };
  const quoteStore = { async save(q) { store.set(q.idempotencyKeyHash, structuredClone(q)); },
    async findByIdempotencyKey(key) { return store.get(key) ?? null; } };
  const service = createQuoteService({ catalog, addresses: { resolve: async () => null }, quoteStore, now: () => new Date('2026-11-09T18:00:00Z') });
  let n = 0;
  return (items) => service.createQuote({ accountId: 'acc', idempotencyKey: `quote-key-${String(++n).padStart(30, '0')}`,
    body: { merchantId: 'm1', fulfillment: 'PICKUP', items } });
}

test('la cotización cobra opciones del servidor y permite el mismo producto con opciones distintas', async () => {
  const quote = quoteWorld();
  const result = await quote([{ menuItemId: 'burger', quantity: 2, variantId: 'doble', modifierIds: ['queso'] },
    { menuItemId: 'burger', quantity: 1 }]);
  assert.equal(result.subtotal, '387.00'); // 2 × (129 + 15) + 99
  const withOptions = result.items.find(item => item.variantId === 'doble');
  assert.equal(withOptions.name, 'Hamburguesa (Doble)'); assert.equal(withOptions.unitPrice, '144.00');
  assert.deepEqual(withOptions.modifiers, [{ modifierId: 'queso', name: 'Queso', priceAdd: '15.00' }]);
});

test('la cotización rechaza la misma configuración dos veces, ids inválidos y opciones fuera de regla', async () => {
  const quote = quoteWorld();
  const isQuoteError = code => error => error instanceof MarketplaceQuoteError && error.code === code;
  await assert.rejects(quote([{ menuItemId: 'burger', quantity: 1, modifierIds: ['queso'] },
    { menuItemId: 'burger', quantity: 2, modifierIds: ['queso'] }]), isQuoteError('INVALID_ITEMS'));
  await assert.rejects(quote([{ menuItemId: 'burger', quantity: 1, modifierIds: [42] }]), isQuoteError('INVALID_ITEMS'));
  await assert.rejects(quote([{ menuItemId: 'burger', quantity: 1, variantId: '' }]), isQuoteError('INVALID_ITEMS'));
  await assert.rejects(quote([{ menuItemId: 'burger', quantity: 1, modifierIds: ['agotado'] }]), isQuoteError('OPTION_NOT_AVAILABLE'));
  await assert.rejects(quote([{ menuItemId: 'burger', quantity: 1, priceAdd: 1 }]), isQuoteError('INVALID_ITEMS'));
});

test('el orden de los ids no cambia la cotización (misma clave, mismo resultado)', async () => {
  const quote = quoteWorld();
  const a = await quote([{ menuItemId: 'burger', quantity: 1, modifierIds: ['tocino', 'queso'] }]);
  const b = await quote([{ menuItemId: 'burger', quantity: 1, modifierIds: ['queso', 'tocino'] }]);
  assert.equal(a.total, b.total);
});
