import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../apps/backend/.env') });
const prisma = new PrismaClient();

async function fixSuperAdmin() {
  const passwordHash = await bcrypt.hash('SuperAdmin1234!', 12);
  const user = await prisma.user.update({
    where: { email: 'super@mrtpvrest.com' },
    data: { passwordHash, isActive: true }
  });
  console.log('Fixed Super Admin:', user.email);
  await prisma.$disconnect();
}

fixSuperAdmin().catch(console.error);
