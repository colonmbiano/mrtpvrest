const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Liberando todas las mesas (Raw SQL)...');
  
  try {
    const closedOrders = await prisma.$executeRaw`UPDATE orders SET status = 'CANCELLED' WHERE status = 'OPEN'`;
    const freedTables = await prisma.$executeRaw`UPDATE tables SET status = 'AVAILABLE' WHERE status != 'AVAILABLE'`;

    console.log(`✅ ${closedOrders} órdenes cerradas.`);
    console.log(`✅ ${freedTables} mesas liberadas.`);
  } catch (err) {
    console.error('Error ejecutando SQL:', err.message);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
