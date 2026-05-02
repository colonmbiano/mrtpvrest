require('dotenv').config({ path: '.env' });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function fix() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: 'colon' } },
        { email: { contains: 'super' } }
      ]
    }
  });

  const hash = await bcrypt.hash('SuperAdmin1234!', 10);

  console.log('Restableciendo contraseñas a SuperAdmin1234! para:');
  for (const u of users) {
    await prisma.user.update({
      where: { id: u.id },
      data: { passwordHash: hash, isActive: true }
    });
    console.log(`- ${u.email}`);

    // Si tiene tenant, asegurarse que el tenant esté activo (si es que la DB lo requiere)
    if (u.tenantId) {
       // El modelo Tenant no tiene isActive, pero restaurant sí.
       if (u.restaurantId) {
          await prisma.restaurant.update({
             where: { id: u.restaurantId },
             data: { isActive: true }
          });
       }
    }
  }
}

fix().catch(console.error).finally(() => prisma.$disconnect());
