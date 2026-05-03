import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient()

const PLATFORM = {
  tenantSlug: 'mrtpvrest-platform',
  tenantName: 'MRTPVREST Platform',
  restaurantSlug: 'mrtpvrest-platform-system',
  superEmail: process.env.SUPERADMIN_EMAIL || 'super@mrtpvrest.com',
  superPassword: process.env.SUPERADMIN_PASSWORD || (() => {
    throw new Error('Falta SUPERADMIN_PASSWORD en env para seed')
  })(),
}

const CUSTOMER = {
  tenantSlug: 'master-burgers-colo',
  tenantName: "Master Burger's Colo",
  restaurantSlug: 'master-burgers-colo-rest',
  adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@mrtpvrest.com',
  adminPassword: process.env.SEED_ADMIN_PASSWORD || (() => {
    throw new Error('Falta SEED_ADMIN_PASSWORD en env para seed')
  })(),
}

async function seedPlatform() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: PLATFORM.tenantSlug },
    create: {
      name: PLATFORM.tenantName,
      slug: PLATFORM.tenantSlug,
      ownerEmail: PLATFORM.superEmail,
      businessType: 'PLATFORM',
      isOnboarded: true,
      onboardingDone: true,
    },
    update: {},
  })

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: PLATFORM.restaurantSlug },
    create: {
      tenantId: tenant.id,
      slug: PLATFORM.restaurantSlug,
      name: PLATFORM.tenantName,
      businessType: 'PLATFORM',
      isActive: false,
    },
    update: {},
  })

  const passwordHash = await bcrypt.hash(PLATFORM.superPassword, 12)
  const user = await prisma.user.upsert({
    where: { email: PLATFORM.superEmail },
    create: {
      name: 'Super Admin',
      email: PLATFORM.superEmail,
      passwordHash,
      role: Role.SUPER_ADMIN,
      tenantId: tenant.id,
      restaurantId: restaurant.id,
      isActive: true,
    },
    update: {
      role: Role.SUPER_ADMIN,
      tenantId: tenant.id,
      restaurantId: restaurant.id,
      isActive: true,
    },
  })

  console.log(`✅ Platform tenant: ${tenant.name} (${tenant.id})`)
  console.log(`✅ Platform restaurant: ${restaurant.name} (${restaurant.id})`)
  console.log(`✅ SUPER_ADMIN: ${user.email} / ${PLATFORM.superPassword}`)
}

async function seedCustomer() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: CUSTOMER.tenantSlug },
    create: {
      name: CUSTOMER.tenantName,
      slug: CUSTOMER.tenantSlug,
      ownerEmail: CUSTOMER.adminEmail,
      businessType: 'RESTAURANT',
      isOnboarded: true,
      onboardingDone: true,
      hasInventory: true,
      hasDelivery: true,
      hasWebStore: true,
      themeConfig: { theme: 'STREET_FOOD', primaryColor: '#FF5733' },
    },
    update: {
      hasInventory: true,
      hasDelivery: true,
      hasWebStore: true,
      themeConfig: { theme: 'STREET_FOOD', primaryColor: '#FF5733' },
    },
  })

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: CUSTOMER.restaurantSlug },
    create: {
      tenantId: tenant.id,
      slug: CUSTOMER.restaurantSlug,
      name: CUSTOMER.tenantName,
      businessType: 'RESTAURANT',
      isActive: true,
    },
    update: {},
  })

  const passwordHash = await bcrypt.hash(CUSTOMER.adminPassword, 12)
  const admin = await prisma.user.upsert({
    where: { email: CUSTOMER.adminEmail },
    create: {
      name: 'Admin Master Burgers',
      email: CUSTOMER.adminEmail,
      passwordHash,
      role: Role.ADMIN,
      tenantId: tenant.id,
      restaurantId: restaurant.id,
      isActive: true,
    },
    update: {
      role: Role.ADMIN,
      tenantId: tenant.id,
      restaurantId: restaurant.id,
      isActive: true,
    },
  })

  console.log(`✅ Customer tenant: ${tenant.name} (${tenant.id})`)
  console.log(`✅ Customer restaurant: ${restaurant.name} (${restaurant.id})`)
  console.log(`✅ ADMIN: ${admin.email} / ${CUSTOMER.adminPassword}`)
}

async function main() {
  console.log('🌱 Seeding platform + customer tenants...\n')
  await seedPlatform()
  console.log()
  await seedCustomer()
  console.log('\n🌱 Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
