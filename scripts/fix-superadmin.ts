import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../apps/backend/.env') });
const prisma = new PrismaClient();

async function fixSuperAdmin() {
  const email = process.env.SUPERADMIN_EMAIL || 'super@mrtpvrest.com';
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!password) {
    throw new Error('Falta SUPERADMIN_PASSWORD en env');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.update({
    where: { email },
    data: { passwordHash, isActive: true }
  });
  console.log('Fixed Super Admin:', user.email);
  await prisma.$disconnect();
}

fixSuperAdmin().catch(console.error);
