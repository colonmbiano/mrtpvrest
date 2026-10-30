'use strict';

// Solo el cluster temporal de Codex. No lee .env ni acepta URLs externas.
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const { createMarketplaceSettlementsPrisma } = require('../src/lib/marketplace-settlements-prisma');
const { buildOrderCaptureTransaction, recordLedgerTransaction } = require('../src/lib/marketplace-ledger');
const { tenantGuard } = require('../../../packages/database/tenant-guard');

async function run() {
  process.env.NODE_PATH = path.dirname(path.dirname(path.dirname(require.resolve('@prisma/client/package.json', { paths: [path.join(ROOT, 'packages/database')] }))));
  require('node:module').Module._initPaths();
  const { PrismaClient } = require(path.join(ROOT, '.marketplace-local/codex-g1/client'));
  const { PrismaPg } = require(path.join(ROOT, 'packages/database/node_modules/@prisma/adapter-pg'));
  const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://codex_test@127.0.0.1:55449/marketplace_codex_test' }) });
  const prisma = base.$extends(tenantGuard({ mode: 'enforce' }));
  const tag = 'fin_' + randomUUID().slice(0, 8);
  const actor = { accountId: 'finance-test', roles: ['SUPER_ADMIN'], isActive: true };
  const reason = 'Validacion financiera desechable';
  const providers = new Map(); let down = false; let time = new Date('2026-10-26T17:00:00Z');
  const getGateway = async () => ({ collectorId: '55', refundPayment: async args => {
    if (down) throw new Error('pasarela simulada temporalmente caida');
    if (!providers.has(args.idempotencyKey)) providers.set(args.idempotencyKey, {
      id: randomUUID(), paymentId: args.paymentId, amountCents: args.amountCents, status: 'approved',
    });
    return providers.get(args.idempotencyKey);
  } });
  const service = () => createMarketplaceSettlementsPrisma({ prisma, getGateway, now: () => new Date(time) });
  let checks = 0; const pass = label => { checks++; console.log('PASS ' + label); };
  try {
    const tenant = await base.tenant.create({ data: { name: tag, slug: tag, ownerEmail: tag + '@example.test' } });
    const restaurant = await base.restaurant.create({ data: { tenantId: tenant.id, name: tag, slug: tag } });
    const location = await base.location.create({ data: { restaurantId: restaurant.id, name: 'Sucursal financiera', slug: tag } });
    let number = 0;
    async function paidOrder() {
      number++;
      const id = tag + '_' + number;
      const providerPaymentId = String(Date.now()) + number;
      await base.order.create({ data: { id, restaurantId: restaurant.id, locationId: location.id, orderNumber: id,
        source: 'MARKETPLACE', orderType: 'DELIVERY', status: 'DELIVERED', paymentMethod: 'CARD', paymentStatus: 'PAID',
        paymentProvider: 'MERCADOPAGO', paymentProviderId: providerPaymentId, subtotal: 100, deliveryFee: 30, total: 130,
        marketplacePipeline: { create: { storeSlug: tag, requestHash: 'a'.repeat(64), trackingTokenHash: 'b'.repeat(64),
          trackingExpiresAt: new Date('2026-11-01'), pinKeyId: 'test', pickupPinHash: 'c'.repeat(64), deliveryPinHash: 'd'.repeat(64),
          paymentMethod: 'ONLINE', collectorId: '55', currency: 'MXN',
          settlement: { subtotalCents: 10000, deliveryFeeCents: 3000, totalCents: 13000, platformFeeCents: 1000,
            merchantPayoutCents: 9000, courierPayoutCents: 3000 },
          dispatch: { task: { id: id + '_task', deliveryPolicy: 'MANUAL', status: 'DELIVERED' } } } } } });
      const payment = await base.marketplacePayment.create({ data: { restaurantId: restaurant.id, orderId: id,
        provider: 'MERCADOPAGO', providerPaymentId, status: 'CAPTURED', amount: '130.00', currency: 'MXN', idempotencyKey: id + '_capture' } });
      await recordLedgerTransaction({ transaction: buildOrderCaptureTransaction({ orderId: id, amount: 130 }),
        paymentId: payment.id, restaurantId: restaurant.id, idempotencyKey: id + '_capture', prismaClient: prisma });
      return id;
    }
    const key = () => 'finance-test-' + randomUUID();
    const first = await paidOrder();
    const settled = await service().reconcileOrder(actor, first);
    assert.equal(settled.replayed, false); assert.equal((await service().reconcileOrder(actor, first)).replayed, true);
    const lines = await base.marketplaceLedgerEntry.findMany({ where: { orderId: first, eventType: 'ORDER_SETTLED' } });
    assert.equal(lines.length, 3); assert.equal(lines.some(row => row.account === 'COURIER_PAYABLE'), false);
    assert.equal(String(lines.find(row => row.account === 'MERCHANT_PAYABLE').amount), '120');
    pass('MANUAL acredita 120 a comercio, 10 a plataforma, cero a red; replay sin doble asiento');

    const owner = { accountId: 'owner', roles: ['MERCHANT_OWNER'], isActive: true, tenantId: tenant.id, restaurantId: restaurant.id };
    const listed = await service().listMerchantSettlements(owner, { merchantId: restaurant.id });
    assert.equal(listed.items[0].netPayoutCents, 12000); assert.equal(listed.items[0].status, 'ACCRUED');
    await assert.rejects(service().listMerchantSettlements({ ...owner, tenantId: 'wrong' }, { merchantId: restaurant.id }), error => error.code === 'MERCHANT_FORBIDDEN');
    pass('consulta contable con tenant real y rechazo de otro tenant');

    const firstKey = key(); const partial = await service().refundOrder(actor, first, firstKey, { reason, amountCents: 6500 });
    assert.equal(partial.remainingCents, 6500); assert.equal((await service().refundOrder(actor, first, firstKey, { reason, amountCents: 6500 })).replayed, true);
    const remaining = await service().listMerchantSettlements(owner, { merchantId: restaurant.id });
    assert.equal(remaining.items.find(row => row.settlementId === 'order:' + first).netPayoutCents, 6000);
    await service().refundOrder(actor, first, key(), { reason });
    assert.equal((await base.order.findUnique({ where: { id: first } })).paymentStatus, 'REFUNDED');
    pass('reembolsos parcial y final con ledger balanceado y estado persistente');

    const concurrent = await paidOrder(); const sharedKey = key(); const before = providers.size;
    const same = await Promise.all([service().refundOrder(actor, concurrent, sharedKey, { reason, amountCents: 5000 }),
      service().refundOrder(actor, concurrent, sharedKey, { reason, amountCents: 5000 })]);
    assert.equal(same[0].refundId, same[1].refundId); assert.equal(providers.size, before + 1);
    assert.equal(await base.marketplaceRefund.count({ where: { orderId: concurrent } }), 1);
    assert.equal(await base.marketplaceLedgerEntry.count({ where: { orderId: concurrent, eventType: 'ORDER_REFUNDED' } }), 2);
    pass('misma clave concurrente: un reembolso del proveedor y una transacción local');

    const competing = await paidOrder(); const competeBefore = providers.size;
    const different = await Promise.allSettled([service().refundOrder(actor, competing, key(), { reason, amountCents: 10000 }),
      service().refundOrder(actor, competing, key(), { reason, amountCents: 10000 })]);
    assert.equal(different.filter(row => row.status === 'fulfilled').length, 1); assert.equal(providers.size, competeBefore + 1);
    pass('claves competidoras no reembolsan más que el saldo de PostgreSQL');

    const recovery = await paidOrder(); down = true;
    await assert.rejects(service().refundOrder(actor, recovery, key(), { reason, amountCents: 1000 }));
    assert.equal(await base.marketplaceRefund.count({ where: { orderId: recovery, status: 'PENDING' } }), 1);
    down = false;
    const recovered = await service().recoverRefunds(actor);
    assert(recovered.items.some(row => row.orderId === recovery && row.status === 'POSTED'));
    pass('reserva pendiente recuperada al recrear servicio tras fallo de pasarela');

    const published = [];
    const drain = () => service().drainOutbox({ publish: async event => { published.push(event.eventKey); }, limit: 100 });
    await Promise.all([drain(), drain()]);
    assert.equal(new Set(published).size, published.length);
    assert.equal(await base.marketplaceFinanceOutbox.count({ where: { restaurantId: restaurant.id, status: 'PENDING' } }), 0);
    pass('consumidores concurrentes reservan eventos una vez y confirman publicación');

    const dead = await base.marketplaceFinanceOutbox.findFirst({ where: { restaurantId: restaurant.id } });
    await base.marketplaceFinanceOutbox.update({ where: { id: dead.id }, data: { status: 'PENDING', leaseToken: 'dead-worker',
      leaseUntil: new Date(time.getTime() + 1000), availableAt: time, publishedAt: null } });
    const beforeLease = published.length; await drain(); assert.equal(published.length, beforeLease);
    time = new Date(time.getTime() + 1001); await drain(); assert.equal(published.length, beforeLease + 1);
    pass('lease de consumidor caído se recupera después de vencer');
    console.log(`Finanzas PostgreSQL desechable: ${checks}/${checks} escenarios PASS`);
  } finally { await base.$disconnect(); }
}
if (require.main === module) {
  if (!process.argv.includes('--disposable')) { console.error('Requiere --disposable y cluster temporal 55449.'); process.exitCode = 2; }
  else run().catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { run };
