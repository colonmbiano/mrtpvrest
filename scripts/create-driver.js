const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../apps/backend/.env') });
const prisma = new PrismaClient();

async function createTestDriver() {
  try {
    const location = await prisma.location.findFirst({ where: { slug: 'matriz-e2e' } });
    if (!location) throw new Error('Location matriz-e2e not found');

    const employee = await prisma.employee.upsert({
      where: { pin: '5555' },
      update: { role: 'DELIVERY', isActive: true },
      create: {
        locationId: location.id,
        name: 'Repartidor E2E',
        pin: '5555',
        role: 'DELIVERY',
        isActive: true,
        canTakeDelivery: true
      }
    });
    console.log('Created Driver:', employee.name, 'PIN: 5555');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createTestDriver();
