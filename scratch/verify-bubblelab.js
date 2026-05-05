const { prisma } = require('../packages/database');

async function main() {
  // Verificar email del tenant BubbleLab
  const r1 = await prisma.tenant.updateMany({
    where: { slug: 'bubblelab' },
    data: {
      emailVerifiedAt: new Date(),
      emailVerificationToken: null,
      emailVerificationExpiry: null,
    }
  });
  console.log('Tenant BubbleLab verificado:', r1);

  // También verificar el usuario propietario
  const r2 = await prisma.user.updateMany({
    where: { email: 'owner@bubblelab.mx' },
    data: { isActive: true }
  });
  console.log('Usuario BubbleLab activado:', r2);

  // Confirmar estado actual
  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'bubblelab' },
    select: { id: true, name: true, emailVerifiedAt: true, isOnboarded: true }
  });
  console.log('Estado actual:', tenant);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
