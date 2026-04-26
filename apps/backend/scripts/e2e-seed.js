const { PrismaClient } = require('@mrtpvrest/database');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = "e2e-test@mrtpvrest.com";
  const password = await bcrypt.hash("AgentTest1234!", 12);

  // Clean up previous runs
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    console.log("Cleaning up previous E2E test data...");
    await prisma.tenant.delete({ where: { id: existingUser.tenantId } });
  }

  // 1. Create Tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: "E2E Test Tenant",
      slug: "e2e-test-tenant",
      ownerEmail: email,
      emailVerifiedAt: new Date(),
      isOnboarded: false, 
      activeModules: JSON.stringify([]),
    }
  });

  // 2. Create Restaurant
  const restaurant = await prisma.restaurant.create({
    data: {
      tenantId: tenant.id,
      name: "Restaurante E2E",
      slug: "restaurante-e2e",
      businessType: "RESTAURANT"
    }
  });

  // 3. Create User
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      restaurantId: restaurant.id,
      name: "E2E Owner",
      email,
      passwordHash: password,
      role: "ADMIN"
    }
  });

  // 4. Create Location
  const location = await prisma.location.create({
    data: {
      restaurantId: restaurant.id,
      name: "Matriz E2E",
      slug: "matriz-e2e",
      businessType: "RESTAURANT"
    }
  });

  // 5. Create basic employee to login to TPV
  const employee = await prisma.employee.create({
    data: {
      locationId: location.id,
      name: "Cajero E2E",
      pin: "1234",
      role: "ADMIN",
      isActive: true
    }
  });

  console.log(`\n✅ CREDENCIALES DE PRUEBA CREADAS EXISTOSAMENTE`);
  console.log(`\n🔑 Dashboard Login:`);
  console.log(`   Email: ${email}`);
  console.log(`   Pass:  AgentTest1234!`);
  console.log(`\n🔑 TPV Login:`);
  console.log(`   PIN: 1234`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
