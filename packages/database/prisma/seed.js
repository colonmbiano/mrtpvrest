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
    { name: 'Hamburguesas', sortOrder: 1 },
    { name: 'Papas',        sortOrder: 2 },
    { name: 'Bebidas',      sortOrder: 3 },
    { name: 'Postres',      sortOrder: 4 },
  ]

  for (const cat of catDefs) {
    const existing = await prisma.category.findFirst({ where: { name: cat.name, restaurantId: rid } })
    if (!existing) await prisma.category.create({ data: { ...cat, restaurantId: rid } })
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
      price: 89, isPopular: true,
    },
    {
      categoryId: hamburguesas.id, restaurantId: rid,
      name: 'Hamburguesa BBQ',
      description: 'Carne de res, tocino, queso gouda, salsa BBQ',
      price: 109, isPopular: true,
    },
    {
      categoryId: papas.id, restaurantId: rid,
      name: 'Papas Fritas',
      description: 'Papas naturales fritas, sal de mar',
      price: 45,
    },
    {
      categoryId: bebidas.id, restaurantId: rid,
      name: 'Refresco',
      description: 'Coca-Cola, Sprite o Fanta 355ml',
      price: 30,
    },
  ]

  for (const p of platillos) {
    const existing = await prisma.menuItem.findFirst({ where: { name: p.name, restaurantId: rid } })
    if (!existing) await prisma.menuItem.create({ data: p })
    else await prisma.menuItem.update({ where: { id: existing.id }, data: { price: p.price } })
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
