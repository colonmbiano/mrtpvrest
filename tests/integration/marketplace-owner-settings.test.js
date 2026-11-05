const test = require('node:test');
const assert = require('node:assert/strict');
const connection = process.env.DATABASE_URL;
const localTestDatabase = (() => {
  try { const url = new URL(connection); return ['localhost', '127.0.0.1'].includes(url.hostname) && /test/.test(url.pathname); }
  catch { return false; }
})();

test('PostgreSQL saves one concurrent revision and its audit atomically', { skip: !localTestDatabase }, async () => {
  const { prisma } = require('../../packages/database');
  const { saveOwnerSettings } = require('../../apps/backend/src/lib/marketplace-owner-settings');
  const env = { MARKETPLACE_PIN_SECRET: 'test-only-pin-key-with-at-least-32-bytes' };
  try {
    await prisma.globalConfig.upsert({ where: { id: 'saas-config' },
      create: { id: 'saas-config' }, update: { marketplaceSettingsVersion: 0 } });
    await prisma.$executeRaw`UPDATE "global_configs" SET "marketplaceSettings" = NULL WHERE id = 'saas-config'`;
    const initialLogs = await prisma.systemLog.count({ where: { message: 'marketplace.settings.updated' } });
    const request = commissionBps => ({ version: 0, settings: { ordersEnabled: true, deliveryEnabled: true, maxDeliveryKm: 5, commissionBps } });
    const outcomes = await Promise.allSettled([saveOwnerSettings(prisma, request(1000), 'test-owner-a', env),
      saveOwnerSettings(prisma, request(2000), 'test-owner-b', env)]);
    assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1);
    assert.equal(outcomes.find(row => row.status === 'rejected').reason.code, 'SETTINGS_CHANGED');
    const row = await prisma.globalConfig.findUnique({ where: { id: 'saas-config' } });
    assert.equal(row.marketplaceSettingsVersion, 1);
    assert.ok([1000, 2000].includes(row.marketplaceSettings.commissionBps));
    assert.equal(await prisma.systemLog.count({ where: { message: 'marketplace.settings.updated' } }), initialLogs + 1);
  } finally { await prisma.$disconnect(); }
});
