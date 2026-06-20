import { PrismaClient, Role, BusinessType } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import 'dotenv/config'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required')
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const tenantSlug = 'retail-demo-santo-tomas'
const adminEmail = 'admin@retaildemo.local'

const storeLocations = [
  ['Centro', 'centro', 'Av. Juarez 100, Centro'],
  ['Norte', 'norte', 'Blvd. Manuel Avila Camacho 200'],
  ['Sur', 'sur', 'Av. Insurgentes Sur 3000'],
  ['Oriente', 'oriente', 'Canal de Tezontle 150'],
  ['Poniente', 'poniente', 'Vasco de Quiroga 3800'],
  ['Santa Fe', 'santa-fe', 'Paseo de la Reforma 400'],
  ['Polanco', 'polanco', 'Campos Eliseos 120'],
  ['Coyoacan', 'coyoacan', 'Carrillo Puerto 20'],
]

const catalog = [
  { category: 'Camisas', name: 'Camisa Oxford Slim', brand: 'Santo Tomas', price: 549, cost: 235, material: 'Algodon' },
  { category: 'Camisas', name: 'Blusa Lino Casual', brand: 'Santo Tomas', price: 499, cost: 210, material: 'Lino' },
  { category: 'Playeras', name: 'Playera Basica Premium', brand: 'Santo Tomas', price: 249, cost: 95, material: 'Algodon' },
  { category: 'Pantalones', name: 'Jeans Denim Regular', brand: 'Santo Tomas', price: 699, cost: 310, material: 'Mezclilla' },
  { category: 'Pantalones', name: 'Pantalon Chino', brand: 'Santo Tomas', price: 649, cost: 285, material: 'Gabardina' },
  { category: 'Vestidos', name: 'Vestido Midi Floral', brand: 'Santo Tomas', price: 799, cost: 350, material: 'Poliester' },
  { category: 'Faldas', name: 'Falda Lapiz Oficina', brand: 'Santo Tomas', price: 459, cost: 190, material: 'Poliester' },
  { category: 'Chamarras', name: 'Chamarra Denim Retro', brand: 'Santo Tomas', price: 899, cost: 420, material: 'Mezclilla' },
  { category: 'Abrigos', name: 'Abrigo Ligero Lana', brand: 'Santo Tomas', price: 1199, cost: 560, material: 'Lana' },
  { category: 'Calzado', name: 'Tenis Urbanos Blancos', brand: 'Santo Tomas', price: 849, cost: 390, material: 'Sintetico' },
  { category: 'Calzado', name: 'Botin Gamuza', brand: 'Santo Tomas', price: 999, cost: 470, material: 'Gamuza' },
  { category: 'Accesorios', name: 'Cinturon Piel Clasico', brand: 'Santo Tomas', price: 299, cost: 120, material: 'Piel' },
]

const sizesByCategory: Record<string, string[]> = {
  Calzado: ['24', '25', '26', '27'],
  Accesorios: ['UNI'],
  default: ['S', 'M', 'L', 'XL'],
}

const colors = ['Negro', 'Blanco', 'Azul', 'Beige']

function slug(input: string) {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase()
}

async function upsertProduct(restaurantId: string, item: typeof catalog[number]) {
  const existing = await prisma.retailProduct.findFirst({
    where: { restaurantId, name: item.name },
    select: { id: true },
  })
  if (existing) {
    return prisma.retailProduct.update({
      where: { id: existing.id },
      data: {
        brand: item.brand,
        category: item.category,
        description: `${item.name} para demo retail SKU por variante.`,
        isActive: true,
      },
    })
  }
  return prisma.retailProduct.create({
    data: {
      restaurantId,
      name: item.name,
      brand: item.brand,
      category: item.category,
      description: `${item.name} para demo retail SKU por variante.`,
    },
  })
}

async function main() {
  console.log('Seeding retail demo Santo Tomas...')

  const plan = await prisma.plan.upsert({
    where: { name: 'UNLIMITED' },
    create: {
      name: 'UNLIMITED',
      displayName: 'Ilimitado',
      price: 99,
      trialDays: 15,
      maxLocations: 999,
      maxEmployees: 999,
      hasKDS: true,
      hasLoyalty: true,
      hasInventory: true,
      hasReports: true,
      hasAPIAccess: true,
    },
    update: {},
  })

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    create: {
      name: 'Retail Demo Santo Tomas',
      slug: tenantSlug,
      ownerEmail: adminEmail,
      businessType: 'RETAIL',
      isOnboarded: true,
      onboardingDone: true,
      emailVerifiedAt: new Date(),
      welcomeEmailSent: true,
      hasInventory: true,
      hasDelivery: false,
      hasWebStore: false,
      activeModules: ['INVENTORY', 'TPV'],
    },
    update: {
      name: 'Retail Demo Santo Tomas',
      businessType: 'RETAIL',
      isOnboarded: true,
      onboardingDone: true,
      emailVerifiedAt: new Date(),
      welcomeEmailSent: true,
      hasInventory: true,
      hasDelivery: false,
      hasWebStore: false,
      activeModules: ['INVENTORY', 'TPV'],
    },
  })

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: tenantSlug },
    create: {
      tenantId: tenant.id,
      slug: tenantSlug,
      name: 'Retail Demo Santo Tomas',
      businessType: 'RETAIL',
      isActive: true,
    },
    update: {
      name: 'Retail Demo Santo Tomas',
      businessType: 'RETAIL',
      isActive: true,
    },
  })

  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'ACTIVE',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      priceSnapshot: plan.price,
      paymentGateway: 'MANUAL',
    },
    update: { status: 'ACTIVE' },
  })

  await prisma.restaurantConfig.upsert({
    where: { restaurantId: restaurant.id },
    create: { restaurantId: restaurant.id, centralWarehouseEnabled: true },
    update: { centralWarehouseEnabled: true },
  })

  const passwordHash = await bcrypt.hash('RetailDemo1234!', 12)
  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      name: 'Admin Retail Demo',
      email: adminEmail,
      passwordHash,
      role: Role.ADMIN,
      tenantId: tenant.id,
      restaurantId: restaurant.id,
      isActive: true,
    },
    update: {
      tenantId: tenant.id,
      restaurantId: restaurant.id,
      role: Role.ADMIN,
      isActive: true,
    },
  })

  const central = await prisma.location.upsert({
    where: { restaurantId_slug: { restaurantId: restaurant.id, slug: 'bodega-central' } },
    create: {
      restaurantId: restaurant.id,
      name: 'Bodega Central',
      slug: 'bodega-central',
      address: 'Centro de distribucion retail',
      businessType: BusinessType.RETAIL,
      isCentralWarehouse: true,
      hasDelivery: false,
      hasTableMap: false,
      hasTakeaway: true,
    },
    update: {
      businessType: BusinessType.RETAIL,
      isCentralWarehouse: true,
      isActive: true,
    },
  })

  const locations = []
  for (let i = 0; i < storeLocations.length; i++) {
    const [name, locSlug, address] = storeLocations[i]
    const location = await prisma.location.upsert({
      where: { restaurantId_slug: { restaurantId: restaurant.id, slug: `santo-tomas-${locSlug}` } },
      create: {
        restaurantId: restaurant.id,
        name: `Santo Tomas ${name}`,
        slug: `santo-tomas-${locSlug}`,
        address,
        businessType: BusinessType.RETAIL,
        isCentralWarehouse: false,
        hasDelivery: false,
        hasTableMap: false,
        hasTakeaway: true,
      },
      update: {
        businessType: BusinessType.RETAIL,
        isCentralWarehouse: false,
        isActive: true,
      },
    })
    locations.push(location)

    await prisma.employee.deleteMany({ where: { locationId: location.id, pin: String(2101 + i) } })
    await prisma.employee.create({
      data: {
        locationId: location.id,
        name: `Encargado ${name}`,
        pin: String(2101 + i),
        offlinePin: crypto.createHash('sha256').update(String(2101 + i)).digest('hex'),
        role: 'MANAGER',
        isActive: true,
        canCharge: true,
        canDiscount: true,
        canModifyTickets: true,
        canDeleteTickets: true,
        canConfigSystem: true,
        canManageShifts: true,
      },
    })
  }

  let skuCount = 0
  for (const item of catalog) {
    const product = await upsertProduct(restaurant.id, item)
    const sizes = sizesByCategory[item.category] || sizesByCategory.default
    for (const size of sizes) {
      for (const color of item.category === 'Accesorios' ? ['Negro', 'Cafe'] : colors) {
        const skuCode = `STD-${slug(item.category).slice(0, 3)}-${slug(item.name).slice(0, 8)}-${slug(size)}-${slug(color).slice(0, 3)}`
        const barcode = `78${String(skuCount + 1).padStart(10, '0')}`
        const sku = await prisma.retailSku.upsert({
          where: { restaurantId_sku: { restaurantId: restaurant.id, sku: skuCode } },
          create: {
            restaurantId: restaurant.id,
            productId: product.id,
            sku: skuCode,
            barcode,
            size,
            color,
            material: item.material,
            price: item.price,
            cost: item.cost,
            isActive: true,
          },
          update: {
            productId: product.id,
            barcode,
            size,
            color,
            material: item.material,
            price: item.price,
            cost: item.cost,
            isActive: true,
          },
        })

        const centralQty = 80
        const centralStock = await prisma.retailStockByLocation.upsert({
          where: { locationId_skuId: { locationId: central.id, skuId: sku.id } },
          create: { restaurantId: restaurant.id, locationId: central.id, skuId: sku.id, qty: centralQty, minQty: 20 },
          update: { qty: centralQty, minQty: 20 },
        })
        await prisma.retailStockMovement.create({
          data: {
            restaurantId: restaurant.id,
            locationId: central.id,
            skuId: sku.id,
            delta: centralQty,
            reason: 'PURCHASE',
            refType: 'retailSeed',
            refId: centralStock.id,
            balanceAfter: centralQty,
            unitCostAtMove: item.cost,
            notes: 'Stock inicial demo retail',
          },
        })

        for (const location of locations) {
          await prisma.retailStockByLocation.upsert({
            where: { locationId_skuId: { locationId: location.id, skuId: sku.id } },
            create: { restaurantId: restaurant.id, locationId: location.id, skuId: sku.id, qty: 12, minQty: 3 },
            update: { qty: 12, minQty: 3 },
          })
        }
        skuCount++
      }
    }
  }

  await prisma.retailDevice.upsert({
    where: { restaurantId_deviceKey: { restaurantId: restaurant.id, deviceKey: 'retail-demo-centro-win-01' } },
    create: {
      restaurantId: restaurant.id,
      locationId: locations[0].id,
      deviceKey: 'retail-demo-centro-win-01',
      name: 'Caja Windows Centro 01',
      platform: 'WINDOWS',
    },
    update: {
      restaurantId: restaurant.id,
      locationId: locations[0].id,
      name: 'Caja Windows Centro 01',
      platform: 'WINDOWS',
      isActive: true,
    },
  })

  console.log('Retail demo listo')
  console.log(`Tenant: ${tenant.slug}`)
  console.log(`Restaurant ID: ${restaurant.id}`)
  console.log(`Bodega central: ${central.name}`)
  console.log(`Tiendas: ${locations.length}`)
  console.log(`SKUs: ${skuCount}`)
  console.log(`Admin: ${adminEmail} / RetailDemo1234!`)
  console.log('PINs tiendas: 2101-2108')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
