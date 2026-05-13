// delete-demo-tenant.js
// Borra el tenant demo "Master Burger's Colo" con todo lo asociado.
// Mantiene Platform tenant + super@mrtpvrest.com intactos.

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEMO_SLUG = 'master-burgers-colo';

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: DEMO_SLUG },
    include: { restaurants: { include: { locations: true } } },
  });
  if (!tenant) {
    console.log(`⚠️  No existe tenant '${DEMO_SLUG}' — nada que borrar.`);
    return;
  }

  console.log(`🗑  Borrando tenant '${tenant.name}' (${tenant.id})…\n`);
  const restaurantIds = tenant.restaurants.map((r) => r.id);
  const locationIds = tenant.restaurants.flatMap((r) => r.locations.map((l) => l.id));

  // Orden de borrado: tablas más hojas primero para no chocar con FK.
  const ops = [
    // Costeo / recetas
    ['recipeItem',                { OR: [{ recipe: { restaurantId: { in: restaurantIds } } }, { menuItem: { restaurantId: { in: restaurantIds } } }] }],
    ['subRecipeItem',             { subRecipe: { restaurantId: { in: restaurantIds } } }],
    ['recipe',                    { restaurantId: { in: restaurantIds } }],
    ['subRecipe',                 { restaurantId: { in: restaurantIds } }],
    ['pricingPolicy',             { restaurantId: { in: restaurantIds } }],

    // Inventario / compras / gastos
    ['stockMovement',             { ingredient: { restaurantId: { in: restaurantIds } } }],
    ['purchaseOrderItem',         { purchaseOrder: { locationId: { in: locationIds } } }],
    ['shiftExpense',              { shift: { locationId: { in: locationIds } } }],
    ['purchaseOrder',             { locationId: { in: locationIds } }],
    ['operatingExpense',          { restaurantId: { in: restaurantIds } }],
    ['operatingExpenseCategory',  { restaurantId: { in: restaurantIds } }],
    ['physicalCountItem',         { physicalCount: { locationId: { in: locationIds } } }],
    ['physicalCount',             { locationId: { in: locationIds } }],
    ['inventoryBatch',            { ingredient: { restaurantId: { in: restaurantIds } } }],
    ['ingredientSupplier',        { ingredient: { restaurantId: { in: restaurantIds } } }],
    ['ingredient',                { restaurantId: { in: restaurantIds } }],
    ['ingredientType',            { restaurantId: { in: restaurantIds } }],
    ['ingredientCategory',        { restaurantId: { in: restaurantIds } }],
    ['supplier',                  { restaurantId: { in: restaurantIds } }],

    // Orders + tickets
    ['orderItemModifier',         { orderItem: { order: { restaurantId: { in: restaurantIds } } } }],
    ['orderItem',                 { order: { restaurantId: { in: restaurantIds } } }],
    ['orderRound',                { order: { restaurantId: { in: restaurantIds } } }],
    ['order',                     { restaurantId: { in: restaurantIds } }],
    ['cashShift',                 { locationId: { in: locationIds } }],

    // Menu
    ['menuItemPrinterGroup',      { menuItem: { restaurantId: { in: restaurantIds } } }],
    ['menuItemComplement',        { menuItem: { restaurantId: { in: restaurantIds } } }],
    ['menuItemVariant',           { menuItem: { restaurantId: { in: restaurantIds } } }],
    ['modifier',                  { modifierGroup: { menuItem: { restaurantId: { in: restaurantIds } } } }],
    ['modifierGroup',             { menuItem: { restaurantId: { in: restaurantIds } } }],
    ['menuItem',                  { restaurantId: { in: restaurantIds } }],
    ['categoryPrinterGroup',      { category: { restaurantId: { in: restaurantIds } } }],
    ['category',                  { restaurantId: { in: restaurantIds } }],

    // Operación
    ['table',                     { locationId: { in: locationIds } }],
    ['zone',                      { locationId: { in: locationIds } }],
    ['employee',                  { locationId: { in: locationIds } }],
    ['waiter',                    { locationId: { in: locationIds } }],
    ['printer',                   { locationId: { in: locationIds } }],
    ['printerGroup',              { locationId: { in: locationIds } }],
    ['device',                    { locationId: { in: locationIds } }],
    ['banner',                    { locationId: { in: locationIds } }],
    ['externalOrder',             { locationId: { in: locationIds } }],
    ['pushSubscription',          { locationId: { in: locationIds } }],
    ['taxConfig',                 { locationId: { in: locationIds } }],
    ['task',                      { locationId: { in: locationIds } }],
    ['ticketConfig',              { locationId: { in: locationIds } }],
    ['tpvRemoteConfig',           { locationId: { in: locationIds } }],

    // Restaurant scope
    ['integrationConfig',         { restaurantId: { in: restaurantIds } }],
    ['restaurantConfig',          { restaurantId: { in: restaurantIds } }],
    ['variantTemplate',           { restaurantId: { in: restaurantIds } }],
    ['loyaltyAccount',            { restaurantId: { in: restaurantIds } }],
    ['coupon',                    { restaurantId: { in: restaurantIds } }],

    // Tenant scope
    ['user',                      { tenantId: tenant.id }],
    ['subscription',              { tenantId: tenant.id }],
    ['location',                  { id: { in: locationIds } }],
    ['restaurant',                { id: { in: restaurantIds } }],
    ['tenant',                    { id: tenant.id }],
  ];

  for (const [model, where] of ops) {
    try {
      const r = await prisma[model].deleteMany({ where });
      if (r.count > 0) console.log(`  • ${model}: ${r.count}`);
    } catch (e) {
      console.log(`  ! ${model}: ${e.message.split('\n')[0]}`);
    }
  }

  console.log('\n✅ Tenant demo eliminado.');

  // Verificación final
  const after = await prisma.tenant.count();
  const restaurants = await prisma.restaurant.count();
  const users = await prisma.user.count();
  console.log(`\n📊 Estado actual:\n   Tenants: ${after}\n   Restaurants: ${restaurants}\n   Users: ${users}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
