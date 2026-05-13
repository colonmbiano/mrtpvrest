const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Liberando todas las mesas...');
  
  // 1. Cancelar o cerrar órdenes abiertas vinculadas a mesas
  const openOrders = await prisma.order.updateMany({
    where: {
      status: 'OPEN',
      tableId: { not: null }
    },
    data: {
      status: 'CANCELLED', // O COMPLETED si prefieres, pero CANCELLED es más rápido para limpiar
      updatedAt: new Date()
    }
  });

  // 2. Resetear el estado de todas las mesas a AVAILABLE
  const tables = await prisma.table.updateMany({
    where: {
      status: { not: 'AVAILABLE' }
    },
    data: {
      status: 'AVAILABLE'
    }
  });

  console.log(`✅ ${openOrders.count} órdenes cerradas.`);
  console.log(`✅ ${tables.count} mesas liberadas.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
