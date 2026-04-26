const { PrismaClient } = require('@mrtpvrest/database');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = "agent-test@mrtpvrest.com";
  const password = await bcrypt.hash("AgentTest1234!", 10);

  const existing = await prisma.tenant.findUnique({ where: { email } });
  if (existing) {
    console.log("Test tenant already exists.");
    process.exit(0);
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: "Agencia IA Test",
      slug: "agencia-test",
      email,
      password,
      role: "ADMIN",
      emailVerifiedAt: new Date(),
      isOnboarded: false, 
    }
  });

  console.log(`Test tenant created: ${tenant.email}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
