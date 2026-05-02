require('dotenv').config({ path: '.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
  console.log('Actualizando slug del tenant principal a "mrtpvrest-platform"...');
  try {
    await prisma.tenant.update({
      where: { slug: 'mrtpvrest-saas' },
      data: { slug: 'mrtpvrest-platform' }
    });
    console.log('✅ Slug actualizado. Ya no aparecerá en la lista.');
  } catch (e) {
    console.error('Error:', e);
  }
}

fix().catch(console.error).finally(() => prisma.$disconnect());
