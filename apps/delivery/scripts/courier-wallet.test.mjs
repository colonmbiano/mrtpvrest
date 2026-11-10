// C8: billetera del repartidor independiente en la app (lógica y render), sin red.
//   node apps/delivery/scripts/courier-wallet.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(path, mocks = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const out = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', out)(id => (id in mocks ? mocks[id] : require(id)), module, module.exports);
  return module.exports;
}
let token = 'tok';
const wallet = load('../src/lib/courierWallet.ts', {
  './config': { getApiUrl: () => 'https://api.test' },
  './courierSession': { getCourierToken: () => token, CourierAuthError: class extends Error { constructor(code, status) { super(code); this.code = code; this.status = status; } } },
});
const item = (extra = {}) => ({ id: 'p1', restaurantId: 'r1', restaurantName: "Master Burger's", businessDate: '2026-11-09', status: 'ISSUED',
  deliveriesCount: 2, earningsCents: 7500, cashCollectedCents: 15500, cashToMerchantCents: 12000, onlineEarningsCents: 4000, netCents: -8000,
  direction: 'COURIER_PAYS', paidAt: null, paymentReference: null,
  lines: [{ orderId: 'o1', orderNumber: 'M-1', deliveredAt: '2026-11-09T20:20:00.000Z', paymentMethod: 'CASH', totalCents: 15500,
    earningsCents: 3500, cashCollectedCents: 15500, cashToMerchantCents: 12000, onlineEarningsCents: 0 }], ...extra });
const body = (items = [item()]) => ({ courierId: 'c1', today: '2026-11-10', from: '2026-10-28',
  totals: { todayEarningsCents: 0, periodEarningsCents: 7500, pendingFromMerchantsCents: 0, owedToMerchantsCents: 8000, ledgerPayableCents: 4000 },
  days: [{ businessDate: '2026-11-10', items: [] }, { businessDate: '2026-11-09', items }] });

test('textos: quién le paga a quién y la fecha corta', () => {
  assert.equal(wallet.settlementText(item()).replace(/\s/g, ' '), "Entrega $80.00 a Master Burger's");
  assert.equal(wallet.settlementText(item({ direction: 'MERCHANT_PAYS', netCents: 4000, cashToMerchantCents: 0 })).replace(/\s/g, ' '), "Master Burger's te paga $40.00");
  assert.equal(wallet.settlementText(item({ status: 'PAID' })), "Saldado con Master Burger's");
  assert.equal(wallet.dayLabel('2026-11-10', '2026-11-10'), 'Hoy'); assert.equal(wallet.dayLabel('2026-11-09', '2026-11-10'), '9 nov');
});

test('valida la respuesta: el neto debe cuadrar y los montos ser enteros', () => {
  assert.equal(wallet.parseWallet(body()).days[1].items[0].netCents, -8000);
  for (const bad of [null, { ...body(), today: 'hoy' }, body([item({ netCents: 1 })]), body([item({ earningsCents: 1.5 })]),
    body([item({ status: 'RARO' })]), body([item({ lines: [{ orderId: 'x' }] })])]) {
    assert.throws(() => wallet.parseWallet(bad), /INVALID_WALLET_RESPONSE/);
  }
});

test('llama con el Bearer del repartidor y traduce errores', async () => {
  const calls = [];
  const ok = async (url, init) => { calls.push([url, init.headers.Authorization]); return { ok: true, json: async () => body() }; };
  assert.equal((await wallet.loadWallet(7, ok)).totals.owedToMerchantsCents, 8000);
  assert.deepEqual(calls[0], ['https://api.test/api/marketplace/v1/couriers/me/wallet?days=7', 'Bearer tok']);
  await assert.rejects(wallet.loadWallet(7, async () => ({ ok: false, status: 404, json: async () => ({ errorCode: 'COURIER_NOT_FOUND' }) })), e => e.code === 'COURIER_NOT_FOUND');
  await assert.rejects(wallet.loadWallet(7, async () => { throw new Error('offline'); }), e => e.code === 'NETWORK');
  await assert.rejects(wallet.loadWallet(99, ok), /INVALID_DAYS/);
  token = null; await assert.rejects(wallet.loadWallet(7, ok), e => e.code === 'UNAUTHENTICATED'); token = 'tok';
});

test('la pantalla de la billetera se monta sin romper (estado inicial de carga)', () => {
  const { CourierWallet } = load('../src/components/delivery/CourierWallet.tsx', {
    '@/lib/tokens': { C: {}, S: {} }, '@/lib/courierWallet': wallet,
  });
  const html = renderToStaticMarkup(React.createElement(CourierWallet));
  assert.match(html, /Mis ganancias/); assert.match(html, /Cargando/);
});
