import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../apps/backend/.env') });
const prisma = new PrismaClient();

async function checkEmployees() {
  const employees = await prisma.employee.findMany();
  console.log(JSON.stringify(employees, null, 2));
  await prisma.$disconnect();
}

checkEmployees();
