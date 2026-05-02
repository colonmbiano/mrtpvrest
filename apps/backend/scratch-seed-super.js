require('dotenv').config({ path: '.env' });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seed() {
  console.log('Creando cuenta de Super Admin y su tenant principal...');
  try {
    const passwordHash = await bcrypt.hash('SuperAdmin1234!', 12);

    const user = await prisma.$transaction(async (tx) => {
      // 1. Crear el Tenant de la plataforma
      const t = await tx.tenant.create({
        data: {
          name: 'MRTPVREST SaaS Central',
          slug: 'mrtpvrest-saas',
          ownerEmail: 'super@mrtpvrest.com',
          isOnboarded: true,
          onboardingDone: true
        }
      });

      // 2. Crear un Restaurante placeholder para evitar errores de llaves
      const r = await tx.restaurant.create({
        data: {
          tenantId: t.id,
          slug: 'mrtpvrest-saas',
          name: 'MRTPVREST Central',
          isActive: true
        }
      });

      // 3. Crear el usuario Super Admin
      return await tx.user.create({
        data: {
          email: 'super@mrtpvrest.com',
          passwordHash,
          name: 'Super Admin',
          role: 'SUPER_ADMIN',
          isActive: true,
          tenantId: t.id,
          restaurantId: r.id
        }
      });
    });

    console.log('✅ Cuenta y estructura base creadas exitosamente:');
    console.log(`- Correo: ${user.email}`);
    console.log(`- Contraseña: SuperAdmin1234!`);
    console.log(`- Rol: ${user.role}`);
  } catch (e) {
    console.error('Error al crear cuenta:', e);
  }
}

seed().catch(console.error).finally(() => prisma.$disconnect());
