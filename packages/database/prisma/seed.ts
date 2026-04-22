import { PrismaClient, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const prisma = new PrismaClient()

const TENANT_SLUG = 'master-burgers-colo'
const TENANT_NAME = "Master Burger's"
const RESTAURANT_SLUG = 'master-burgers-colo-rest'
const ADMIN_EMAIL = 'admin@mrtpvrest.com'
const ADMIN_PASSWORD = 'Admin1234!'

async function main() {
  console.log('🌱 Seeding initial tenant, restaurant and super-admin...\n')

  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    create: {
      name: TENANT_NAME,
      slug: TENANT_SLUG,
      ownerEmail: ADMIN_EMAIL,
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
  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`)

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: RESTAURANT_SLUG },
    create: {
      tenantId: tenant.id,
      slug: RESTAURANT_SLUG,
      name: TENANT_NAME,
      businessType: 'RESTAURANT',
      isActive: true,
    },
    update: {},
  })
  console.log(`✅ Restaurant: ${restaurant.name} (${restaurant.id})`)

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12)
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      name: 'Super Admin',
      email: ADMIN_EMAIL,
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
  console.log(`✅ User SUPER_ADMIN: ${admin.email} / ${ADMIN_PASSWORD}`)
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
