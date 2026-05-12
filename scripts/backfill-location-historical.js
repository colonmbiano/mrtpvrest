/**
 * backfill-location-historical.js
 *
 * Las órdenes generadas por scripts/importar-ventas-historicas.js
 * quedaron con locationId=null. Esto las hace invisibles para los
 * endpoints que filtran por sucursal. Este script asigna la sucursal
 * "Principal" del restaurante a todas ellas.
 *
 * Uso: node scripts/backfill-location-historical.js <restaurantId>
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/backend/.env') });
const { prisma } = require(require('path').resolve(__dirname, '../packages/database'));

(async () => {
  const restaurantId = process.argv[2];
  if (!restaurantId) {
    console.error('Uso: node scripts/backfill-location-historical.js <restaurantId>');
    process.exit(1);
  }

  const locs = await prisma.location.findMany({
    where: { restaurantId, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (locs.length === 0) {
    console.error('❌ El restaurante no tiene sucursales activas.');
    process.exit(1);
  }
  const target = locs[0];
  console.log(`📍 Asignando a sucursal: ${target.name} (${target.id})`);

  const before = await prisma.order.count({
    where: { restaurantId, source: 'HISTORICAL_IMPORT', locationId: null },
  });
  console.log(`   ${before.toLocaleString()} órdenes históricas sin locationId.`);

  const r = await prisma.order.updateMany({
    where: { restaurantId, source: 'HISTORICAL_IMPORT', locationId: null },
    data: { locationId: target.id },
  });
  console.log(`✅ Actualizadas: ${r.count.toLocaleString()}`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
