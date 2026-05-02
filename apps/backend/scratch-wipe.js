require('dotenv').config({ path: '.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function wipe() {
  console.log('Iniciando TRUNCATE CASCADE...');
  try {
    // Esto borra Tenant y TODAS las tablas que dependen de ella en cascada.
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "tenants" CASCADE;`);
    console.log('✅ Base de datos limpiada (TRUNCATE).');
  } catch (e) {
    console.error('Error durante TRUNCATE:', e);
  }
}

wipe().catch(console.error).finally(() => prisma.$disconnect());
