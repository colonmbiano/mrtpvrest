// prisma/seed-superadmin.js — Crea el usuario SUPER_ADMIN de MRTPVREST
// Ejecutar: node prisma/seed-superadmin.js
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Creando Super Admin...\n')

  const passwordHash = await bcrypt.hash('SuperAdmin1234!', 12)

  const user = await prisma.user.upsert({
    where:  { email: 'super@mrtpvrest.com' },
    create: {
      name:         'Super Admin',
      email:        'super@mrtpvrest.com',
      phone:        '5500000000',
      passwordHash,
      role:         'SUPER_ADMIN',
      restaurantId: null,
      isActive:     true,
    },
    update: {
      name:         'Super Admin',
      passwordHash,
      role:         'SUPER_ADMIN',
      isActive:     true,
    },
  })

  console.log('✅ Super Admin listo')
  console.log('─────────────────────────────────────')
  console.log(`Email    : ${user.email}`)
  console.log(`Password : SuperAdmin1234!`)
  console.log(`Role     : ${user.role}`)
  console.log(`ID       : ${user.id}`)
  console.log('\n⚠️  Cambia la contraseña después del primer login.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
