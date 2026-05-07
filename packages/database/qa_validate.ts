import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required')
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("=== DB VALIDATION FOR QA TENANT ===")
  
  // Find the tenant we just created
  const tenant = await prisma.tenant.findFirst({
    where: { name: 'Prueba QA Master' },
    orderBy: { createdAt: 'desc' }
  })
  
  if (!tenant) {
    console.log("Tenant 'Prueba QA Master' not found!")
    return
  }
  
  console.log(`\nTenant ID: ${tenant.id}`)
  console.log(`Tenant Slug: ${tenant.slug}`)
  console.log(`Theme Background: ${tenant.themeBg}`)
  console.log(`Theme Accent: ${tenant.themeAccent}`)

  // Verify Categories
  const categories = await prisma.category.findMany({
    where: { tenantId: tenant.id }
  })
  console.log(`\nCategories found: ${categories.length}`)
  categories.forEach(c => console.log(`- [${c.id}] ${c.name} (Tenant: ${c.tenantId})`))

  // Verify Products
  const products = await prisma.menuItem.findMany({
    where: { tenantId: tenant.id }
  })
  console.log(`\nProducts found: ${products.length}`)
  products.forEach(p => console.log(`- [${p.id}] ${p.name} - $${p.price} (Tenant: ${p.tenantId})`))
  
  // Verify Employee
  const employees = await prisma.user.findMany({
    where: { tenantId: tenant.id }
  })
  console.log(`\nEmployees found: ${employees.length}`)
  employees.forEach(e => console.log(`- [${e.id}] ${e.name} - Role: ${e.role} (Tenant: ${e.tenantId})`))
  
  console.log("\n=== VALIDATION COMPLETE ===")
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
