import { PrismaClient, Role, IngredientBaseUnit } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import fs from 'node:fs'
import path from 'node:path'
import 'dotenv/config'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required')
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

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
  tenantName: "Restaurante Demo Colo",
  restaurantSlug: 'master-burgers-colo-rest',
  locationSlug: 'master-burgers-colo-centro',
  locationName: 'Sucursal Centro',
  adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@mrtpvrest.com',
  adminPassword: process.env.SEED_ADMIN_PASSWORD || (() => {
    throw new Error('Falta SEED_ADMIN_PASSWORD en env para seed')
  })(),
}

// ── Data extraída del Excel real "Costeo de recetas - USD.xlsx" ──
// 4 TIPOS, 10 CATEGORIAS, 21 PROVEEDORES, ~95 INGREDIENTES.
// Si necesitas regenerar, corre el script python en /tmp y reemplaza
// el archivo `seed-data.json` adyacente.

type SeedIngredient = {
  name: string
  supplier: string | null
  type: string | null
  category: string | null
  baseUnit: 'GRAM' | 'ML' | 'PIECE'
  purchaseUnit: string
  purchaseQty: number
  purchasePrice: number
  pesoBruto: number | null
  pesoNeto: number | null
  isPackaging: boolean
}

type SeedDataset = {
  types: string[]
  categories: string[]
  suppliers: string[]
  ingredients: SeedIngredient[]
}

function loadSeedData(): SeedDataset {
  const file = path.join(__dirname, 'seed-data.json')
  if (!fs.existsSync(file)) {
    console.warn(`⚠️  No se encontró ${file} — saltando seeds de inventario`)
    return { types: [], categories: [], suppliers: [], ingredients: [] }
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

// ── Helpers ──

// costPerBase: el "costo real por unidad base" del Excel.
// purchasePrice / purchaseQty_en_base / (pesoNeto/pesoBruto)
function computeCostPerBase(ing: SeedIngredient): number {
  // Normalizar purchaseQty a baseUnit (Kg → 1000g, L → 1000ml)
  let qtyBase = ing.purchaseQty
  if (ing.purchaseUnit.toLowerCase().includes('kilogramo')) qtyBase *= 1000
  if (ing.purchaseUnit.toLowerCase().includes('litro')) qtyBase *= 1000

  const costPerUnit = ing.purchasePrice / qtyBase
  const yieldFactor =
    ing.pesoBruto && ing.pesoNeto && ing.pesoNeto > 0
      ? ing.pesoBruto / ing.pesoNeto
      : 1
  return costPerUnit * yieldFactor
}

// ════════════════════════════════════════════════════════════════════════
// SEED — PLATFORM
// ════════════════════════════════════════════════════════════════════════

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
  console.log(`✅ SUPER_ADMIN: ${user.email}`)
}

// ════════════════════════════════════════════════════════════════════════
// SEED — CUSTOMER + INVENTARIO (taxonomía, proveedores, ingredientes)
// ════════════════════════════════════════════════════════════════════════

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

  // ── Location (necesaria para Ingredient.locationId) ──
  const location = await prisma.location.upsert({
    where: { restaurantId_slug: { restaurantId: restaurant.id, slug: CUSTOMER.locationSlug } },
    create: {
      restaurantId: restaurant.id,
      slug: CUSTOMER.locationSlug,
      name: CUSTOMER.locationName,
      address: 'Av. Central 123, Col. Centro',
      isActive: true,
    },
    update: {},
  })

  const passwordHash = await bcrypt.hash(CUSTOMER.adminPassword, 12)
  const admin = await prisma.user.upsert({
    where: { email: CUSTOMER.adminEmail },
    create: {
      name: 'Admin Restaurante Demo',
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
  console.log(`✅ Customer location: ${location.name} (${location.id})`)
  console.log(`✅ ADMIN: ${admin.email}`)

  // ── Fase inventario ──
  await seedInventory(restaurant.id, location.id)
}

// ────────────────────────────────────────────────────────────────────────
// SEED — INVENTARIO (taxonomía + proveedores + ingredientes)
// ────────────────────────────────────────────────────────────────────────

async function seedInventory(restaurantId: string, locationId: string) {
  const data = loadSeedData()
  if (data.types.length === 0) return

  console.log(`\n🌱 Sembrando inventario (${data.ingredients.length} ingredientes)...`)

  // ── IngredientTypes ──
  const typeMap = new Map<string, string>()
  for (const name of data.types) {
    const t = await prisma.ingredientType.upsert({
      where: { restaurantId_name: { restaurantId, name } },
      create: { restaurantId, name },
      update: {},
    })
    typeMap.set(name, t.id)
  }
  console.log(`  • ${typeMap.size} tipos`)

  // ── IngredientCategories ──
  const categoryColors: Record<string, string> = {
    'PROTEINAS': '#dc2626',
    'LACTEOS Y DERIVADOS': '#fbbf24',
    'BEBIDAS': '#3b82f6',
    'DESECHABLES': '#9ca3af',
    'ACEITE Y GRASAS': '#f59e0b',
    'GRANOS Y CEREALES': '#a16207',
    'CONDIMENTOS Y CONSERVAS': '#84cc16',
    'CONGELADOS Y CONSERVAS': '#0891b2',
    'INSUMOS DE COCINA': '#6b7280',
    'PANADERIA Y REPOSTERIA': '#c2410c',
  }
  const categoryMap = new Map<string, string>()
  for (const name of data.categories) {
    const c = await prisma.ingredientCategory.upsert({
      where: { restaurantId_name: { restaurantId, name } },
      create: { restaurantId, name, color: categoryColors[name] || null },
      update: { color: categoryColors[name] || null },
    })
    categoryMap.set(name, c.id)
  }
  console.log(`  • ${categoryMap.size} categorías`)

  // ── Suppliers ──
  const supplierMap = new Map<string, string>()
  for (const name of data.suppliers) {
    // Upsert manual (Supplier no tiene @@unique en este schema).
    const existing = await prisma.supplier.findFirst({
      where: { restaurantId, name },
    })
    const s = existing
      ? existing
      : await prisma.supplier.create({
          data: { restaurantId, name, isActive: true },
        })
    supplierMap.set(name, s.id)
  }
  console.log(`  • ${supplierMap.size} proveedores`)

  // ── Ingredients ──
  let created = 0
  let skipped = 0
  for (const ing of data.ingredients) {
    const typeId = ing.type ? typeMap.get(ing.type) ?? null : null
    const categoryId = ing.category ? categoryMap.get(ing.category) ?? null : null
    const supplierId = ing.supplier ? supplierMap.get(ing.supplier) ?? null : null

    // Idempotencia: si ya existe un ingrediente con el mismo nombre en esta
    // location, lo saltamos. No usamos @unique compuesto en Ingredient para
    // permitir variantes (ej. "tomate" de 2 proveedores diferentes).
    const exists = await prisma.ingredient.findFirst({
      where: { restaurantId, locationId, name: ing.name },
    })
    if (exists) {
      skipped++
      continue
    }

    const costPerBase = computeCostPerBase(ing)

    await prisma.ingredient.create({
      data: {
        restaurantId,
        locationId,
        name: ing.name,
        typeId,
        categoryId,
        supplierId,
        baseUnit: ing.baseUnit as IngredientBaseUnit,
        unit: ing.purchaseUnit, // legacy
        purchaseUnit: ing.purchaseUnit,
        purchaseQty: ing.purchaseQty,
        purchaseCost: ing.purchasePrice,
        pesoBruto: ing.pesoBruto,
        pesoNeto: ing.pesoNeto,
        cost: costPerBase,
        stock: 0,
        minStock: 0,
        isPackaging: ing.isPackaging,
        isActive: true,
      },
    })
    created++
  }
  console.log(`  • ${created} ingredientes creados (${skipped} duplicados saltados)`)

  // ── PricingPolicy default por restaurante (70% margen meta) ──
  await prisma.pricingPolicy.upsert({
    where: { restaurantId_categoryId: { restaurantId, categoryId: null as any } },
    create: { restaurantId, targetMarginPct: 70 },
    update: {},
  }).catch(() => {
    // Prisma puede quejarse del compound unique con null — fallback create-if-missing
    return prisma.pricingPolicy.create({
      data: { restaurantId, targetMarginPct: 70 },
    }).catch(() => null)
  })
  console.log(`  • PricingPolicy default (70% margen)`)
}

// ════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('🌱 Seeding platform + customer + inventario...\n')
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
