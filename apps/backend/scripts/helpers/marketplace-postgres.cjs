'use strict';

const { createRequire } = require('node:module');
const path = require('node:path');
const { tenantGuard } = require('../../../../packages/database/tenant-guard');

const root = path.resolve(__dirname, '../../../..');
const databaseRequire = createRequire(path.join(root, 'packages/database/package.json'));

function database() {
  // CI comparte el PostgreSQL efímero del workflow. En local se conserva el
  // cluster y cliente temporal documentados. Nunca usar una URL arbitraria.
  const ciDatabase = 'postgresql://postgres:postgres@localhost:5432/mrtpvrest_test';
  const useCiDatabase = process.env.MARKETPLACE_TEST_POSTGRES === '1';
  if (useCiDatabase && process.env.DATABASE_URL !== ciDatabase) {
    throw new Error('Se requiere la base desechable mrtpvrest_test del workflow.');
  }
  let PrismaClient;
  if (useCiDatabase) {
    ({ PrismaClient } = databaseRequire('@prisma/client'));
  } else {
    process.env.NODE_PATH = path.dirname(path.dirname(path.dirname(databaseRequire.resolve('@prisma/client/package.json'))));
    require('node:module').Module._initPaths();
    ({ PrismaClient } = require(path.join(root, '.marketplace-local/codex-g1/client')));
  }
  const { PrismaPg } = databaseRequire('@prisma/adapter-pg');
  const connectionString = useCiDatabase ? ciDatabase : 'postgresql://codex_test@127.0.0.1:55449/marketplace_codex_test';
  const base = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  return { base, prisma: base.$extends(tenantGuard({ mode: 'enforce' })) };
}

module.exports = { database };
