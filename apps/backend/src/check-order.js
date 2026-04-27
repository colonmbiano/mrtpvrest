const { prisma } = require('C:/Users/colon/Downloads/mrtpvrest/packages/database/generated/client');

async function checkOrder() {
  const orderId = 'cmogwjqa300065w66iutxxwel';
  console.log(`Checking order ${orderId}...`);
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });
    if (order) {
      console.log('Order found:', JSON.stringify(order, null, 2));
    } else {
      console.log('Order NOT found in database.');
    }
  } catch (err) {
    console.error('Prisma error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

checkOrder();
