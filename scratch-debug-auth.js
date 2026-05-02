require('dotenv').config({ path: 'apps/backend/.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugAuth() {
  const users = await prisma.user.findMany({
    select: { 
      email: true, 
      role: true, 
      isActive: true, 
      restaurantId: true,
      tenant: {
        select: {
          isActive: true
        }
      }
    }
  });
  console.table(users.map(u => ({
    email: u.email,
    role: u.role,
    userActive: u.isActive,
    tenantActive: u.tenant ? u.tenant.isActive : 'N/A'
  })));
}

debugAuth().catch(console.error).finally(() => prisma.$disconnect());
