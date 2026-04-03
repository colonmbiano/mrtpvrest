// prisma/seed.js — Datos de ejemplo para Master Burger's
// Ejecutar: node prisma/seed.js
// Requiere: seed-plans.js y seed-tenant.js corridos primero
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed de datos de ejemplo...\n')

  // 0. Encontrar el restaurante Master Burger's
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: 'master-burguers' }
  })
  if (!restaurant) {
    throw new Error("Restaurante 'master-burguers' no encontrado. Corre seed-tenant.js primero.")
  }
  const rid = restaurant.id
  console.log(`✅ Restaurante encontrado: ${restaurant.name} (${rid})\n`)

  // 1. Admin del restaurante
  const adminPassword = await bcrypt.hash('Admin1234!', 12)
  await prisma.user.upsert({
    where:  { email: 'admin@masterburguers.com' },
    create: {
      name:         'Admin Master',
      email:        'admin@masterburguers.com',
      phone:        '5500000001',
      passwordHash: adminPassword,
      role:         'ADMIN',
      restaurantId: rid,
      isActive:     true,
    },
    update: {},
  })
  console.log('✅ Admin creado — admin@masterburguers.com / Admin1234!')

  // 2. Usuario Cocina
  const kitchenPassword = await bcrypt.hash('Cocina1234!', 12)
  await prisma.user.upsert({
    where:  { email: 'cocina@masterburguers.com' },
    create: {
      name:         'Cocina',
      email:        'cocina@masterburguers.com',
      phone:        '5500000002',
      passwordHash: kitchenPassword,
      role:         'KITCHEN',
      restaurantId: rid,
      isActive:     true,
    },
    update: {},
  })
  console.log('✅ Cocina creado  — cocina@masterburguers.com / Cocina1234!')

  // 3. Categorías
  const catDefs = [
    { name: 'Hamburguesas', sortOrder: 1, loyverseId: 'seed-hamburguesas' },
    { name: 'Papas',        sortOrder: 2, loyverseId: 'seed-papas-cat'    },
    { name: 'Bebidas',      sortOrder: 3, loyverseId: 'seed-bebidas'      },
    { name: 'Postres',      sortOrder: 4, loyverseId: 'seed-postres'      },
  ]

  for (const cat of catDefs) {
    await prisma.category.upsert({
      where:  { loyverseId: cat.loyverseId },
      create: { ...cat, restaurantId: rid },
      update: {},
    })
  }
  console.log('✅ Categorías creadas')

  // 4. Platillos
  const hamburguesas = await prisma.category.findFirst({ where: { name: 'Hamburguesas', restaurantId: rid } })
  const papas        = await prisma.category.findFirst({ where: { name: 'Papas',        restaurantId: rid } })
  const bebidas      = await prisma.category.findFirst({ where: { name: 'Bebidas',      restaurantId: rid } })

  const platillos = [
    {
      categoryId: hamburguesas.id, restaurantId: rid,
      name: 'Hamburguesa Clásica',
      description: 'Carne de res, lechuga, tomate, queso americano',
      price: 89, isPopular: true, loyverseId: 'seed-burg-clasica',
    },
    {
      categoryId: hamburguesas.id, restaurantId: rid,
      name: 'Hamburguesa BBQ',
      description: 'Carne de res, tocino, queso gouda, salsa BBQ',
      price: 109, isPopular: true, loyverseId: 'seed-burg-bbq',
    },
    {
      categoryId: papas.id, restaurantId: rid,
      name: 'Papas Fritas',
      description: 'Papas naturales fritas, sal de mar',
      price: 45, loyverseId: 'seed-papas',
    },
    {
      categoryId: bebidas.id, restaurantId: rid,
      name: 'Refresco',
      description: 'Coca-Cola, Sprite o Fanta 355ml',
      price: 30, loyverseId: 'seed-refresco',
    },
  ]

  for (const p of platillos) {
    await prisma.menuItem.upsert({
      where:  { loyverseId: p.loyverseId },
      create: p,
      update: { price: p.price },
    })
  }
  console.log('✅ Platillos creados')

  // 5. Cupón de bienvenida
  await prisma.coupon.upsert({
    where:  { code: 'BIENVENIDO' },
    create: {
      restaurantId:  rid,
      code:          'BIENVENIDO',
      description:   '20% de descuento en tu primer pedido',
      discountType:  'PERCENTAGE',
      discountValue: 20,
      minOrderAmount: 100,
      maxUses:       100,
      expiresAt:     new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      isActive:      true,
    },
    update: {},
  })
  console.log('✅ Cupón BIENVENIDO creado (20% off)')

  console.log('\n🎉 Seed completado.')
  console.log('─────────────────────────────────────────────────')
  console.log('Admin  : admin@masterburguers.com / Admin1234!')
  console.log('Cocina : cocina@masterburguers.com / Cocina1234!')
  console.log('Cupón  : BIENVENIDO (20% off primer pedido)')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
