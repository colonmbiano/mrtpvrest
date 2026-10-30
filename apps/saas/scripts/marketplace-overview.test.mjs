import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../lib/marketplaceOverview.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
const module = { exports: {} };
vm.runInNewContext(compiled.outputText, { module, exports: module.exports });
const { parseMarketplaceOverview, loadMarketplaceOverview, MARKETPLACE_OVERVIEW_URL } = module.exports;
const fixture = () => ({ currency: 'MXN', gmvTotal: 100, platformFees: 7.35, totalOrders: 4, activeMerchants: 1,
  balances: { GATEWAY_ESCROW: 85, MERCHANT_PAYABLE: 60, COURIER_PAYABLE: -2 },
  merchants: [{ id: 'r1', name: 'Tienda', businessType: 'RESTAURANT', isActive: true, orderCount: 4, gmv: 100, createdAt: '2026-10-25T18:00:00Z' }],
  recentTransactions: [{ id: 't1', orderId: 'o1', restaurantId: 'r1', eventType: 'ORDER_SETTLED', amount: 25, createdAt: '2026-10-25T18:00:00Z' }] });

test('usa el endpoint existente y preserva cifras del servidor, sin imponer comisión del 5%', async () => {
  const calls = [];
  const result = await loadMarketplaceOverview({ get: async url => { calls.push(url); return { data: fixture() }; } });
  assert.deepEqual(calls, ['/api/saas/marketplace/overview']);
  assert.equal(MARKETPLACE_OVERVIEW_URL, calls[0]);
  assert.equal(result.platformFees, 7.35);
  assert.equal(result.gmvTotal, 100);
  assert.equal(result.totalOrders, 4);
  assert.equal(result.recentTransactions.length, 1);
  assert.equal(result.balances.COURIER_PAYABLE, -2);
});
test('conserva el orden de transacciones del servidor y acepta un marketplace vacío', () => {
  const value = fixture(); value.merchants = []; value.recentTransactions = [];
  value.totalOrders = 0; value.activeMerchants = 0; value.gmvTotal = 0; value.platformFees = 0;
  assert.equal(parseMarketplaceOverview(value).totalOrders, 0);
});
test('un 403 del servidor no se convierte en datos vacíos o métricas inventadas', async () => {
  const forbidden = Object.assign(new Error('Acceso restringido'), { response: { status: 403 } });
  await assert.rejects(loadMarketplaceOverview({ get: async () => { throw forbidden; } }), error => error === forbidden);
});
for (const [name, mutate] of [
  ['moneda inesperada', v => { v.currency = 'USD'; }],
  ['balance ausente', v => { delete v.balances; }],
  ['importe no numérico', v => { v.platformFees = '7.35'; }],
  ['contador negativo', v => { v.totalOrders = -1; }],
  ['fecha inválida', v => { v.recentTransactions[0].createdAt = 'sin fecha'; }],
  ['comercio incompleto', v => { delete v.merchants[0].name; }],
]) test(`rechaza ${name} antes de renderizar`, () => { const value = fixture(); mutate(value); assert.throws(() => parseMarketplaceOverview(value)); });
