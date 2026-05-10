// Use the same import as the backend
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../apps/backend/.env') });

const prisma = require('./packages/database/index.js').prisma;

async function main() {
  if (!prisma) {
    console.error('Prisma client not found');
    return;
  }
  const bundles = await prisma.otaBundle.findMany({
    orderBy: { createdAt: 'desc' },
  });
  console.log('--- OTA BUNDLES IN DB ---');
  if (bundles.length === 0) {
    console.log('No bundles found.');
  } else {
    console.table(bundles.map(b => ({
      id: b.id,
      version: b.version,
      appId: b.appId,
      channel: b.channel,
      isActive: b.isActive,
      createdAt: b.createdAt
    })));
  }
}

main().catch(console.error).finally(() => {
  if (prisma) prisma.$disconnect();
});
