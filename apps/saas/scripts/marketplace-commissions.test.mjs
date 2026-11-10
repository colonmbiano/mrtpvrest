// SaaS: estado de cuenta de comisiones del Mercadito (C5).
// Ejecuta el mismo módulo que importa la pantalla, sin red.
//   node apps/saas/scripts/marketplace-commissions.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const forbidden = () => { throw new Error('Offline SaaS suite forbids network'); };
const ts = require('typescript');
const source = readFileSync(new URL('../lib/marketplaceCommissions.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { fileName: 'marketplaceCommissions.ts', reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
const module = { exports: {} };
vm.runInNewContext(compiled.outputText, { module, exports: module.exports, require: forbidden, fetch: forbidden, Intl });
const { formatCents, monthLabel, recentPeriods, statusLabel, nextAction, parseCommissionList, loadCommissionList,
  issueStatement, payStatement, paymentInputError, commissionError } = module.exports;
const plain = value => JSON.parse(JSON.stringify(value));

const row = (extra = {}) => ({ restaurantId: 'r1', restaurantName: "Master Burger's", period: '2026-10', status: 'TO_ISSUE',
  ordersCount: 3, salesCents: 55000, commissionCents: 5500, pendingCount: 0, excludedCount: 0, cancelledCount: 1,
  issuedAt: null, paidAt: null, paymentReference: null, ...extra });
const body = (items = [row()], extra = {}) => ({ period: '2026-10', currentPeriod: '2026-11',
  totals: { merchants: items.length, commissionCents: 5500, paidCents: 0, issuedCents: 0, unissuedCents: 5500 }, items, ...extra });

test('formatea pesos y meses en español', () => {
  assert.equal(formatCents(550050).replace(/\s/g, ' '), '$5,500.50');
  assert.equal(monthLabel('2026-10'), 'octubre 2026');
  assert.deepEqual(plain(recentPeriods('2026-02', 4)), ['2026-02', '2026-01', '2025-12', '2025-11']);
  assert.throws(() => recentPeriods('2026-13'));
  assert.equal(statusLabel('ISSUED'), 'Emitido · por cobrar');
});

test('la acción de cada fila: emitir solo un mes cerrado y limpio; pagar solo lo emitido', () => {
  assert.equal(nextAction(row()), 'ISSUE');
  assert.equal(nextAction(row({ pendingCount: 1 })), null);
  assert.equal(nextAction(row({ excludedCount: 1 })), null);
  assert.equal(nextAction(row({ ordersCount: 0 })), null);
  assert.equal(nextAction(row({ status: 'OPEN' })), null);
  assert.equal(nextAction(row({ status: 'ISSUED' })), 'PAY');
  assert.equal(nextAction(row({ status: 'PAID' })), null);
});

test('valida la respuesta del backend antes de pintarla', () => {
  assert.equal(parseCommissionList(body()).items[0].commissionCents, 5500);
  for (const bad of [null, [], body([row({ status: 'RARO' })]), body([row({ commissionCents: -1 })]),
    body([row({ commissionCents: 60000 })]), body([row(), row()]), body([row({ period: '2026-09' })]),
    body([row({ restaurantId: '../x' })]), { ...body(), totals: null }, body([row()], { period: '2026-1' })]) {
    assert.throws(() => parseCommissionList(bad), /INVALID_COMMISSIONS_RESPONSE/);
  }
});

test('las llamadas van a las rutas de ops con el mes y la referencia limpia', async () => {
  const calls = [];
  const api = { get: async (url, config) => { calls.push(['get', url, config.params]); return { data: body() }; },
    post: async (url, payload) => { calls.push(['post', url, payload]); return { data: {} }; } };
  await loadCommissionList(api, { period: '2026-10' });
  await issueStatement(api, 'r1', '2026-10');
  await payStatement(api, 'r1', '2026-10', '  SPEI 123 ', '');
  await payStatement(api, 'r1', '2026-10', 'SPEI 124', ' BBVA ');
  assert.deepEqual(plain(calls), [
    ['get', '/api/marketplace/v1/ops/commissions', { period: '2026-10' }],
    ['post', '/api/marketplace/v1/ops/commissions/r1/issue', { period: '2026-10' }],
    ['post', '/api/marketplace/v1/ops/commissions/r1/pay', { period: '2026-10', reference: 'SPEI 123' }],
    ['post', '/api/marketplace/v1/ops/commissions/r1/pay', { period: '2026-10', reference: 'SPEI 124', note: 'BBVA' }]]);
  await assert.rejects(loadCommissionList(api, { period: '2026-09' }), /INVALID_COMMISSIONS_RESPONSE/);
  await assert.rejects(issueStatement(api, 'r1/../x', '2026-10'), /INVALID_MERCHANT/);
  await assert.rejects(payStatement(api, 'r1', '2026-10', 'ab'), /entre 3 y 200/);
  assert.equal(paymentInputError('SPEI 1', 'x'.repeat(501)), 'La nota admite máximo 500 caracteres.');
});

test('los errores se muestran en palabras: permisos, mensaje del backend o genérico', () => {
  assert.match(commissionError({ response: { status: 403 } }), /autorización/);
  assert.equal(commissionError({ response: { status: 409, data: { error: 'Hay 1 pedido(s) sin cerrar' } } }), 'Hay 1 pedido(s) sin cerrar');
  assert.match(commissionError({ response: { status: 503, data: { error: 'detalle interno' } } }), /No se pudo/);
  assert.match(commissionError(new Error('red')), /No se pudo/);
});
