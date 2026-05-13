const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const envPath = path.join(process.cwd(), 'apps/backend/.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function createTestAdmin() {
  const pin = '1234';
  const hashedPin = await bcrypt.hash(pin, 10);
  const locationId = 'cmop06au40008snbdbb3sq00t'; 
  
  const prisma = new PrismaClient();
  
  try {
    // Buscar si ya existe
    const existing = await prisma.employee.findFirst({
      where: { name: 'Admin Simulador', locationId }
    });

    if (existing) {
      console.log('ℹ️ El admin de prueba ya existe.');
      return;
    }

    const employee = await prisma.employee.create({
      data: {
        name: 'Admin Simulador',
        role: 'ADMIN',
        pin: hashedPin,
        locationId: locationId,
        isActive: true,
        canManageShifts: true,
      }
    });
    console.log(`✅ Admin de prueba creado: ${employee.name} (ID: ${employee.id})`);
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createTestAdmin();
