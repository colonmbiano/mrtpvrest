const { prisma } = require('../../../packages/database');

async function checkBritany() {
  const id = 'cmob6q6bs000xfpr900o40vmr';
  console.log(`Checking ID ${id} in both tables...`);
  try {
    const waiter = await prisma.waiter.findUnique({ where: { id } });
    const employee = await prisma.employee.findUnique({ where: { id } });
    
    console.log('Results:');
    console.log('Waiter Table:', waiter ? 'FOUND' : 'NOT FOUND');
    console.log('Employee Table:', employee ? 'FOUND' : 'NOT FOUND');
    
    if (employee) console.log('Employee Data:', JSON.stringify(employee, null, 2));
    if (waiter) console.log('Waiter Data:', JSON.stringify(waiter, null, 2));

    const britanys = await prisma.employee.findMany({ where: { name: { contains: 'Britany', mode: 'insensitive' } } });
    console.log('Employees named Britany:', JSON.stringify(britanys, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

checkBritany();
