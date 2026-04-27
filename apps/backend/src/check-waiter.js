const { prisma } = require('C:/Users/colon/Downloads/mrtpvrest/packages/database/generated/client');

async function checkWaiter() {
  const waiterId = 'cmob6q6bs000xfpr900o40vmr';
  console.log(`Checking waiter ${waiterId}...`);
  try {
    const waiter = await prisma.waiter.findUnique({
      where: { id: waiterId }
    });
    if (waiter) {
      console.log('Waiter found:', JSON.stringify(waiter, null, 2));
    } else {
      console.log('Waiter NOT found in database.');
      // List all waiters
      const all = await prisma.waiter.findMany({ take: 5 });
      console.log('Current waiters in DB (first 5):', JSON.stringify(all, null, 2));
    }
  } catch (err) {
    console.error('Prisma error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

checkWaiter();
