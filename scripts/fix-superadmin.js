const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../apps/backend/.env') });
const prisma = new PrismaClient();

async function fixSuperAdmin() {
  try {
    const passwordHash = '$2a$12$Hj4CzCeddQsO.SH6tPv1VeDxSdVFBhHYPPWJLI9./LceR/LSVK08W';
    const user = await prisma.user.update({
      where: { email: 'super@mrtpvrest.com' },
      data: { passwordHash, isActive: true }
    });
    console.log('Fixed Super Admin:', user.email);
  } catch (error) {
    console.error('Error fixing Super Admin:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixSuperAdmin();
