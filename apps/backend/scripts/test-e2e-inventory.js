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

  // 9. Cleanup
  console.log(`\n  Cleanup...`);
  await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
  await prisma.order.delete({ where: { id: order.id } });
  await prisma.stockMovement.deleteMany({ where: { refId: order.id } });
  await prisma.recipeItem.deleteMany({ where: { recipeId: recipe.id } });
  await prisma.recipe.delete({ where: { id: recipe.id } });
  await prisma.menuItem.delete({ where: { id: menuItem.id } });
  await prisma.category.delete({ where: { id: category.id } });
  await prisma.ingredient.update({ where: { id: ingredient.id }, data: { stock: 0 } });
  info('Cleanup ok');

  console.log('\n' + SEP);
  console.log('E2E · Descuento via SubRecipe (recursivo)');
  console.log(SEP);

  // Tomar 2 ingredientes para construir una sub-receta
  const ings = await prisma.ingredient.findMany({
    where: { restaurantId: restaurant.id, locationId: location.id, isPackaging: false },
    take: 2,
    orderBy: { name: 'asc' },
  });
  if (ings.length < 2) {
    fail('Faltan ingredientes para test de sub-receta');
  } else {
    const [ingA, ingB] = ings;
    info(`Ingrediente A: ${ingA.name} · cost=${ingA.cost} ${ingA.baseUnit}`);
    info(`Ingrediente B: ${ingB.name} · cost=${ingB.cost} ${ingB.baseUnit}`);

    await prisma.ingredient.update({ where: { id: ingA.id }, data: { stock: 2000 } });
    await prisma.ingredient.update({ where: { id: ingB.id }, data: { stock: 2000 } });
    info('Stock inicial A=2000, B=2000');

    // SubRecipe: rinde 1000g de salsa con 5% margen error, contiene 400g A + 200g B
    const SUB_YIELD = 1000;
    const SUB_MARGIN = 5;
    const sub = await prisma.subRecipe.create({
      data: {
        restaurantId: restaurant.id,
        name: `_E2E SubReceta ${Date.now()}`,
        yieldQty: SUB_YIELD,
        yieldUnit: 'GRAM',
        marginErrorPct: SUB_MARGIN,
        items: {
          create: [
            { ingredientId: ingA.id, qty: 400, unit: 'GRAM' },
            { ingredientId: ingB.id, qty: 200, unit: 'GRAM' },
          ],
        },
      },
    });
    info(`SubRecipe creada · rinde ${SUB_YIELD}g (margen ${SUB_MARGIN}%)`);

    // Recipe que consume 100g de la sub-receta
    const cat2 = await prisma.category.create({
      data: { restaurantId: restaurant.id, name: `_e2e_sub_${Date.now()}`, sortOrder: 998 },
    });
    const mi2 = await prisma.menuItem.create({
      data: { restaurantId: restaurant.id, categoryId: cat2.id, name: '_E2E Plato con salsa', price: 100 },
    });
    const recipe2 = await prisma.recipe.create({ data: { menuItemId: mi2.id, restaurantId: restaurant.id } });
    const RECIPE_QTY = 100;
    await prisma.recipeItem.create({
      data: {
        recipeId: recipe2.id,
        subRecipeId: sub.id,
        quantity: RECIPE_QTY,
        unit: 'GRAM',
        wastagePercent: 0,
      },
    });
    info(`Recipe creada: consume ${RECIPE_QTY}g de la SubRecipe`);

    const ORDER_QTY2 = 3;
    const order2 = await prisma.order.create({
      data: {
        restaurantId: restaurant.id,
        locationId: location.id,
        orderNumber: `E2E-SUB-${Date.now()}`,
        orderType: 'DINE_IN',
        status: 'CONFIRMED',
        paymentMethod: 'CASH',
        subtotal: 300,
        total: 300,
        items: { create: [{ menuItemId: mi2.id, name: mi2.name, price: 100, quantity: ORDER_QTY2, subtotal: 300 }] },
      },
      include: { items: true },
    });

    console.log(`\n  ⚡ Ejecutando discountInventory (sub-receta) ...`);
    await discountInventory(prisma, order2.items, order2.id, restaurant.id, location.id);

    // Cálculo esperado:
    // factor = 100 / 1000 = 0.1
    // adj = 0.1 / 0.95 = 0.105263...
    // tomate (A) per unit = 0.105263 × 400 = 42.105g
    // cebolla (B) per unit = 0.105263 × 200 = 21.053g
    // × 3 unidades del plato = A:126.315g  B:63.158g
    const factor = RECIPE_QTY / SUB_YIELD;
    const adj = factor / (1 - SUB_MARGIN / 100);
    const expectedA = adj * 400 * ORDER_QTY2;
    const expectedB = adj * 200 * ORDER_QTY2;
    const stockA = (await prisma.ingredient.findUnique({ where: { id: ingA.id } })).stock;
    const stockB = (await prisma.ingredient.findUnique({ where: { id: ingB.id } })).stock;

    console.log(`\n  Verificaciones sub-receta:`);
    if (Math.abs(stockA - (2000 - expectedA)) < 0.01) {
      pass(`Stock A final = ${stockA.toFixed(3)} (consumio ~${expectedA.toFixed(3)})`);
    } else {
      fail(`Stock A final = ${stockA} (esperado ${(2000 - expectedA).toFixed(3)})`);
    }
    if (Math.abs(stockB - (2000 - expectedB)) < 0.01) {
      pass(`Stock B final = ${stockB.toFixed(3)} (consumio ~${expectedB.toFixed(3)})`);
    } else {
      fail(`Stock B final = ${stockB} (esperado ${(2000 - expectedB).toFixed(3)})`);
    }

    const movs = await prisma.stockMovement.findMany({ where: { refType: 'order', refId: order2.id } });
    if (movs.length === 2) {
      pass(`StockMovements creados: 2 (uno por cada ingrediente hoja)`);
    } else {
      fail(`StockMovements count = ${movs.length} (esperado 2)`);
    }

    // Cleanup sub-receta test
    await prisma.orderItem.deleteMany({ where: { orderId: order2.id } });
    await prisma.order.delete({ where: { id: order2.id } });
    await prisma.stockMovement.deleteMany({ where: { refId: order2.id } });
    await prisma.recipeItem.deleteMany({ where: { recipeId: recipe2.id } });
    await prisma.recipe.delete({ where: { id: recipe2.id } });
    await prisma.menuItem.delete({ where: { id: mi2.id } });
    await prisma.category.delete({ where: { id: cat2.id } });
    await prisma.subRecipeItem.deleteMany({ where: { subRecipeId: sub.id } });
    await prisma.subRecipe.delete({ where: { id: sub.id } });
    await prisma.ingredient.update({ where: { id: ingA.id }, data: { stock: 0 } });
    await prisma.ingredient.update({ where: { id: ingB.id }, data: { stock: 0 } });
    info('Cleanup sub-receta ok');
  }

  console.log('\n' + SEP);
  if (process.exitCode === 1) {
    console.log('  ❌ TEST FALLÓ');
  } else {
    console.log('  ✅ TEST OK · módulo de inventario funcionando E2E (con SubRecipe)');
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
