/**
 * Seed del DEMO comercial de ferretería — "Ferretería El Constructor".
 *
 * Datos tomados de docs/Demo_Ferreteria_MRTPVREST.pdf (catálogo de la sección 03
 * y el registro JSON de la sección 04). Sirve para PRESENTAR, no para testear:
 * el seed del E2E es apps/backend/scripts/e2e-seed-retail.js y siembra otro
 * tenant con datos mínimos y deterministas.
 *
 * Idempotente: se puede correr contra el mismo entorno las veces que haga falta.
 *
 * ⚠️ NO correr contra producción sin querer: crea un tenant real. Está pensado
 * para un entorno de demo/local. Los precios, existencias y marcas son ficticios
 * (así lo dice el propio PDF) y deben sustituirse por los del prospecto.
 *
 * Uso:  node apps/backend/scripts/seed-demo-ferreteria.js
 */
const { prisma } = require('@mrtpvrest/database');

const SLUG = 'ferreteria-el-constructor';
const PIN = process.env.DEMO_PIN || '1234';

// Listas de precio del guion: el catálogo del PDF trae columna Público y
// Contratista para cada producto, y la escena 2 del demo es "el sistema aplica
// precio contratista" al elegir al cliente.
const LISTS = [
  { name: 'Público', isDefault: true, sortOrder: 0 },
  { name: 'Contratista', isDefault: false, sortOrder: 1 },
];

// Catálogo del PDF (sección 03). `publico` es el precio de catálogo del SKU;
// `contratista` va como precio en su lista.
const CATALOG = [
  { cat: 'Construcción', name: 'Cemento gris 50 kg', sku: 'CON-CEM-50', barcode: '7500000000011',
    unit: 'BULTO', stock: 185, publico: 265, contratista: 249, cost: 218, bin: 'Patio A - Tarima 01', min: 40 },
  { cat: 'Construcción', name: 'Mortero 50 kg', sku: 'CON-MOR-50', barcode: '7500000000028',
    unit: 'BULTO', stock: 74, publico: 190, contratista: 179, cost: 155, bin: 'Patio A - Tarima 02', min: 20 },
  { cat: 'Construcción', name: 'Varilla 3/8" de 12 m', sku: 'CON-VAR-38', barcode: '7500000000035',
    unit: 'PZA', stock: 96, publico: 198, contratista: 187, cost: 162, bin: 'Patio B - Rack 01', min: 30 },
  // El JSON de la sección 04 del PDF: SKU, barcode, costo, mínimo y ubicación.
  { cat: 'Electricidad', name: 'Cable THW calibre 12', sku: 'ELE-CAB-THW12', barcode: '750000000101',
    unit: 'MTS', stock: 640, publico: 18, contratista: 16.5, cost: 11.5, bin: 'Pasillo E - Anaquel 03', min: 150,
    // "Rollo de 100 metros" del PDF: capturar por rollo manda 100 m a inventario.
    unitsPerPackage: 100 },
  { cat: 'Plomería', name: 'Tubo PVC 1/2 pulgada', sku: 'PLO-PVC-12', barcode: '7500000000059',
    unit: 'PZA', stock: 43, publico: 89, contratista: 82, cost: 68, bin: 'Pasillo C - Anaquel 05', min: 15 },
  { cat: 'Tornillería', name: 'Tornillo para madera', sku: 'TOR-MAD-KG', barcode: '7500000000066',
    unit: 'KG', stock: 38.5, publico: 115, contratista: 104, cost: 84, bin: 'Pasillo B - Anaquel 02', min: 10,
    // Mayoreo: el guion vende "2.5 kg" al mostrador, pero el contratista lleva bulto.
    tier: { minQty: 25, price: 96 } },
  { cat: 'Pinturas', name: 'Pintura blanca 19 L', sku: 'PIN-BLA-19', barcode: '7500000000073',
    unit: 'CUBETA', stock: 27, publico: 1249, contratista: 1159, cost: 980, bin: 'Pasillo F - Anaquel 01', min: 8 },
  { cat: 'Pinturas', name: 'Impermeabilizante 19 L', sku: 'PIN-IMP-19', barcode: '7500000000080',
    unit: 'CUBETA', stock: 16, publico: 1590, contratista: 1470, cost: 1240, bin: 'Pasillo F - Anaquel 02', min: 6 },
  { cat: 'Herramientas manuales', name: 'Martillo 16 oz', sku: 'HER-MAR-16', barcode: '7500000000097',
    unit: 'PZA', stock: 22, publico: 249, contratista: 225, cost: 178, bin: 'Pasillo A - Anaquel 04', min: 6 },
  { cat: 'Herramientas eléctricas', name: 'Taladro inalámbrico', sku: 'HER-TAL-INA', barcode: '7500000000103',
    unit: 'PZA', stock: 8, publico: 2399, contratista: 2199, cost: 1850, bin: 'Vitrina 01', min: 3 },
  { cat: 'Herramientas manuales', name: 'Cinta métrica 5 m', sku: 'HER-CIN-5', barcode: '7500000000110',
    unit: 'PZA', stock: 34, publico: 129, contratista: 115, cost: 88, bin: 'Pasillo A - Anaquel 01', min: 10 },
  { cat: 'Plomería', name: 'Llave mezcladora', sku: 'PLO-LLA-MEZ', barcode: '7500000000127',
    unit: 'PZA', stock: 12, publico: 849, contratista: 790, cost: 640, bin: 'Pasillo C - Anaquel 01', min: 4 },
];

async function main() {
  if (/supabase\.co|railway|amazonaws/i.test(process.env.DATABASE_URL || '')) {
    console.error('✋ DATABASE_URL apunta a un entorno remoto. Este seed crea un tenant real.');
    console.error('   Si es a propósito, corre con DEMO_ALLOW_REMOTE=1.');
    if (!process.env.DEMO_ALLOW_REMOTE) process.exit(1);
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: SLUG },
    update: {},
    create: {
      name: 'Ferretería El Constructor',
      slug: SLUG,
      ownerEmail: 'demo-ferreteria@mrtpvrest.com',
      emailVerifiedAt: new Date(),
      isOnboarded: true,
      isDemo: true, // se filtra fuera de las métricas de clientes reales
      activeModules: JSON.stringify([]),
    },
  });

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: SLUG },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Ferretería El Constructor',
      slug: SLUG,
      businessType: 'RETAIL',
    },
  });

  await prisma.restaurantConfig.upsert({
    where: { restaurantId: restaurant.id },
    update: { retailGiro: 'FERRETERIA' },
    create: { restaurantId: restaurant.id, retailGiro: 'FERRETERIA' },
  });

  let location = await prisma.location.findFirst({ where: { restaurantId: restaurant.id, slug: SLUG } });
  if (!location) {
    location = await prisma.location.create({
      data: { restaurantId: restaurant.id, name: 'Matriz', slug: SLUG, businessType: 'RETAIL' },
    });
  }

  let employee = await prisma.employee.findFirst({
    where: { locationId: location.id, name: 'Demo Ferretería' },
  });
  if (!employee) {
    employee = await prisma.employee.create({
      data: { locationId: location.id, name: 'Demo Ferretería', pin: PIN, role: 'ADMIN', isActive: true },
    });
  }

  // Listas de precio
  const listByName = {};
  for (const l of LISTS) {
    listByName[l.name] = await prisma.retailPriceList.upsert({
      where: { restaurantId_name: { restaurantId: restaurant.id, name: l.name } },
      update: { isDefault: l.isDefault, sortOrder: l.sortOrder },
      create: { restaurantId: restaurant.id, name: l.name, isDefault: l.isDefault, sortOrder: l.sortOrder },
    });
  }

  // Catálogo. Un producto por artículo: en ferretería el SKU ES la unidad
  // vendible, no hay matriz talla×color que agrupe (useVariantMatrix=false).
  for (const p of CATALOG) {
    let product = await prisma.retailProduct.findFirst({
      where: { restaurantId: restaurant.id, name: p.name },
    });
    if (!product) {
      product = await prisma.retailProduct.create({
        data: { restaurantId: restaurant.id, name: p.name, category: p.cat, brand: 'Genérico', isActive: true },
      });
    }

    const sku = await prisma.retailSku.upsert({
      where: { restaurantId_sku: { restaurantId: restaurant.id, sku: p.sku } },
      update: {
        barcode: p.barcode, price: p.publico, cost: p.cost,
        unitOfMeasure: p.unit, unitsPerPackage: p.unitsPerPackage ?? null,
        binLocation: p.bin, isActive: true,
      },
      create: {
        restaurantId: restaurant.id, productId: product.id, sku: p.sku,
        barcode: p.barcode, price: p.publico, cost: p.cost,
        unitOfMeasure: p.unit, unitsPerPackage: p.unitsPerPackage ?? null,
        binLocation: p.bin, isActive: true,
      },
    });

    await prisma.retailStockByLocation.upsert({
      where: { locationId_skuId: { locationId: location.id, skuId: sku.id } },
      update: { qty: p.stock, minQty: p.min },
      create: {
        restaurantId: restaurant.id, locationId: location.id, skuId: sku.id,
        qty: p.stock, minQty: p.min,
      },
    });

    // Precio de contratista. El de público NO se captura: es el precio de
    // catálogo del SKU, y una lista sin fila para un SKU usa ése.
    await prisma.retailPriceListItem.upsert({
      where: { priceListId_skuId: { priceListId: listByName['Contratista'].id, skuId: sku.id } },
      update: { price: p.contratista },
      create: {
        restaurantId: restaurant.id,
        priceListId: listByName['Contratista'].id,
        skuId: sku.id,
        price: p.contratista,
      },
    });

    if (p.tier) {
      await prisma.retailPriceTier.upsert({
        where: { skuId_minQty: { skuId: sku.id, minQty: p.tier.minQty } },
        update: { price: p.tier.price },
        create: { restaurantId: restaurant.id, skuId: sku.id, minQty: p.tier.minQty, price: p.tier.price },
      });
    }
  }

  const bajos = CATALOG.filter((p) => p.stock <= p.min).length;
  console.log('\n✅ Demo "Ferretería El Constructor" sembrado');
  console.log(`   restaurantId: ${restaurant.id}`);
  console.log(`   locationId:   ${location.id}`);
  console.log(`   PIN:          ${PIN}`);
  console.log(`   Productos:    ${CATALOG.length}  ·  Listas: ${LISTS.map((l) => l.name).join(', ')}`);
  console.log(`   Inventario bajo: ${bajos}`);
  console.log('\n   Guion: escanea 7500000000011 (cemento), cambia a Contratista y compara.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
