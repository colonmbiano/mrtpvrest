// scripts/test-e2e-inventory.js
//
// E2E test del flujo de descuento de inventario tras una venta.
// NO levanta el servidor HTTP — invoca discountInventory directamente
// con fixtures creadas via Prisma. Limpia todo al final.
//
// Run: node apps/backend/scripts/test-e2e-inventory.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { prisma } = require('@mrtpvrest/database');
const { discountInventory } = require('../src/routes/orders.routes');

const SEP = '─'.repeat(60);

function pass(msg) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`); }
function fail(msg) { console.log(`  \x1b[31m✗\x1b[0m ${msg}`); process.exitCode = 1; }
function info(msg) { console.log(`  • ${msg}`); }

async function main() {
  console.log('\n' + SEP);
  console.log('E2E · Descuento de inventario al cobrar');
  console.log(SEP);

  // 1. Encontrar restaurant+location demo del seed
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: 'master-burgers-colo-rest' },
    include: { locations: true },
  });
  if (!restaurant) throw new Error('No existe restaurant demo. Corre el seed primero.');
  const location = restaurant.locations[0];
  if (!location) throw new Error('No existe location demo.');
  info(`Restaurant: ${restaurant.name}`);
  info(`Location:   ${location.name}`);

  // 2. Tomar 1 ingrediente del seed (cualquier proteína)
  const ingredient = await prisma.ingredient.findFirst({
    where: { restaurantId: restaurant.id, locationId: location.id, isPackaging: false },
    include: { type: true, category: true },
  });
  if (!ingredient) throw new Error('No hay ingredientes sembrados.');
  info(`Ingrediente: ${ingredient.name} (${ingredient.category?.name}) · cost=${ingredient.cost} ${ingredient.baseUnit}`);

  // 3. Setear stock inicial conocido
  const INITIAL_STOCK = 1000;
  await prisma.ingredient.update({
    where: { id: ingredient.id },
    data: { stock: INITIAL_STOCK },
  });
  info(`Stock inicial seteado a ${INITIAL_STOCK}`);

  // 4. Crear Category + MenuItem de prueba
  const category = await prisma.category.create({
    data: { restaurantId: restaurant.id, name: `_e2e_test_${Date.now()}`, sortOrder: 999 },
  });
  const menuItem = await prisma.menuItem.create({
    data: {
      restaurantId: restaurant.id,
      categoryId: category.id,
      name: '_E2E Burger',
      price: 150,
      isAvailable: true,
    },
  });
  info(`MenuItem creado: ${menuItem.name} ($${menuItem.price})`);

  // 5. Crear Recipe + RecipeItem (200g del ingrediente, 10% wastage)
  const recipe = await prisma.recipe.create({
    data: {
      menuItemId: menuItem.id,
      restaurantId: restaurant.id,
      marginErrorPct: 0,
      priceDelivery: 175,
      platformCommissionPct: 27,
    },
  });
  const RECIPE_QTY = 200;        // 200 unidades del ingrediente por plato
  const WASTAGE_PCT = 10;        // +10% merma
  await prisma.recipeItem.create({
    data: {
      recipeId: recipe.id,
      ingredientId: ingredient.id,
      quantity: RECIPE_QTY,
      unit: ingredient.baseUnit,
      wastagePercent: WASTAGE_PCT,
    },
  });
  info(`Recipe creada: ${RECIPE_QTY}${ingredient.baseUnit.toLowerCase()} × +${WASTAGE_PCT}% wastage`);

  // 6. Crear Order + OrderItem (qty=2)
  const ORDER_QTY = 2;
  const order = await prisma.order.create({
    data: {
      restaurantId: restaurant.id,
      locationId: location.id,
      orderNumber: `E2E-${Date.now()}`,
      orderType: 'DINE_IN',
      status: 'CONFIRMED',
      paymentMethod: 'CASH',
      subtotal: menuItem.price * ORDER_QTY,
      total: menuItem.price * ORDER_QTY,
      items: {
        create: [{
          menuItemId: menuItem.id,
          name: menuItem.name,
          price: menuItem.price,
          quantity: ORDER_QTY,
          subtotal: menuItem.price * ORDER_QTY,
        }],
      },
    },
    include: { items: true },
  });
  info(`Order creada: ${order.orderNumber} · qty=${ORDER_QTY}`);

  // 7. ⚡ Disparar discountInventory
  console.log(`\n  ⚡ Ejecutando discountInventory...`);
  await discountInventory(prisma, order.items, order.id, restaurant.id, location.id);

  // 8. Verificaciones
  console.log(`\n  Verificaciones:`);

  const expectedConsumed = RECIPE_QTY * (1 + WASTAGE_PCT / 100) * ORDER_QTY;
  const expectedStock = INITIAL_STOCK - expectedConsumed;
  const expectedCostUnit = RECIPE_QTY * (1 + WASTAGE_PCT / 100) * Number(ingredient.cost);

  const refreshed = await prisma.ingredient.findUnique({ where: { id: ingredient.id } });
  if (Math.abs(refreshed.stock - expectedStock) < 0.001) {
    pass(`Stock final = ${refreshed.stock} (esperado ${expectedStock})`);
  } else {
    fail(`Stock final = ${refreshed.stock} (esperado ${expectedStock})`);
  }

  const movements = await prisma.stockMovement.findMany({
    where: { refType: 'order', refId: order.id },
  });
  if (movements.length === 1) {
    pass(`StockMovement creado: 1 fila con reason=${movements[0].reason}`);
    const m = movements[0];
    if (Math.abs(m.delta - (-expectedConsumed)) < 0.001) {
      pass(`delta = ${m.delta} (esperado ${-expectedConsumed})`);
    } else {
      fail(`delta = ${m.delta} (esperado ${-expectedConsumed})`);
    }
    if (Math.abs(m.balanceAfter - expectedStock) < 0.001) {
      pass(`balanceAfter = ${m.balanceAfter} (esperado ${expectedStock})`);
    } else {
      fail(`balanceAfter = ${m.balanceAfter} (esperado ${expectedStock})`);
    }
  } else {
    fail(`StockMovement count = ${movements.length} (esperado 1)`);
  }

  const refreshedItem = await prisma.orderItem.findFirst({
    where: { orderId: order.id },
  });
  if (refreshedItem.costSnapshot != null && Math.abs(refreshedItem.costSnapshot - expectedCostUnit) < 0.01) {
    pass(`OrderItem.costSnapshot = ${refreshedItem.costSnapshot} (esperado ~${expectedCostUnit.toFixed(4)})`);
  } else {
    fail(`OrderItem.costSnapshot = ${refreshedItem.costSnapshot} (esperado ~${expectedCostUnit.toFixed(4)})`);
  }
  if (refreshedItem.recipeIdSnap === recipe.id) {
    pass(`OrderItem.recipeIdSnap = ${recipe.id}`);
  } else {
    fail(`OrderItem.recipeIdSnap = ${refreshedItem.recipeIdSnap} (esperado ${recipe.id})`);
  }

  // Verificar legacy InventoryMovement también escribió
  const legacy = await prisma.inventoryMovement.findMany({
    where: { orderId: order.id, ingredientId: ingredient.id },
  });
  if (legacy.length === 1) {
    pass(`InventoryMovement (legacy) también creado: 1 fila`);
  } else {
    fail(`InventoryMovement (legacy) count = ${legacy.length}`);
  }

  // 9. Cleanup
  console.log(`\n  Cleanup...`);
  await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
  await prisma.order.delete({ where: { id: order.id } });
  await prisma.stockMovement.deleteMany({ where: { refId: order.id } });
  await prisma.inventoryMovement.deleteMany({ where: { orderId: order.id } });
  await prisma.recipeItem.deleteMany({ where: { recipeId: recipe.id } });
  await prisma.recipe.delete({ where: { id: recipe.id } });
  await prisma.menuItem.delete({ where: { id: menuItem.id } });
  await prisma.category.delete({ where: { id: category.id } });
  await prisma.ingredient.update({ where: { id: ingredient.id }, data: { stock: 0 } });
  info('Cleanup ok');

  console.log('\n' + SEP);
  if (process.exitCode === 1) {
    console.log('  ❌ TEST FALLÓ');
  } else {
    console.log('  ✅ TEST OK · módulo de inventario funcionando E2E');
  }
  console.log(SEP + '\n');
}

main()
  .catch((e) => {
    console.error('\n❌ ERROR:', e.message);
    console.error(e.stack);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
