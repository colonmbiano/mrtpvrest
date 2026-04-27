import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../apps/backend/.env') });
const prisma = new PrismaClient();

async function findDriver() {
  const drivers = await prisma.employee.findMany({
    where: { role: 'DRIVER' },
    include: { 
      location: {
        include: { restaurant: true }
      }
    }
  });
  console.log(JSON.stringify(drivers, null, 2));
  await prisma.$disconnect();
}

findDriver();
