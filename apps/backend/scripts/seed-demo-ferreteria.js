/**
 * Seed del DEMO comercial de ferretería — "Ferretería El Constructor".
 *
 * Siembra 100 artículos desde scripts/data/catalogo-ferreteria.js. Los 12
 * primeros son los de docs/Demo_Ferreteria_MRTPVREST.pdf (sección 03 y el JSON
 * de la 04) y conservan sus códigos porque el guion de la presentación los
 * dicta; el resto es surtido típico de ferretería.
 *
 * Sirve para PRESENTAR, no para testear: el seed del E2E es
 * apps/backend/scripts/e2e-seed-retail.js y siembra otro tenant con datos
 * mínimos y deterministas.
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
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SLUG = 'ferreteria-el-constructor';
const PIN = process.env.DEMO_PIN || '1234';
// Contraseña del admin del demo. La caja NO arranca en el PIN pad: primero pide
// vincular el dispositivo con correo+password (User), y hasta entonces el PIN no
// existe. Sin este usuario el tenant sembrado era inalcanzable desde la app —
// se podía ver por API, no por la caja.
const EMAIL = process.env.DEMO_EMAIL || 'demo-ferreteria@mrtpvrest.com';
const PASSWORD = process.env.DEMO_PASSWORD || 'DemoFerreteria2026';

// Listas de precio del guion: el catálogo del PDF trae columna Público y
// Contratista para cada producto, y la escena 2 del demo es "el sistema aplica
// precio contratista" al elegir al cliente.
const LISTS = [
  { name: 'Público', isDefault: true, sortOrder: 0 },
  { name: 'Contratista', isDefault: false, sortOrder: 1 },
];

// Catálogo (100 artículos). Los 12 primeros son los del PDF, el resto es surtido
// típico de ferretería. `publico` es el precio de catálogo del SKU; `contratista`
// va como precio en su lista.
const { CATALOGO: CATALOG } = require('./data/catalogo-ferreteria');


async function main() {
  if (/supabase\.co|railway|amazonaws/i.test(process.env.DATABASE_URL || '')) {
    console.error('✋ DATABASE_URL apunta a un entorno remoto. Este seed crea un tenant real.');
    console.error('   Si es a propósito, corre con DEMO_ALLOW_REMOTE=1.');
    if (!process.env.DEMO_ALLOW_REMOTE) process.exit(1);
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: SLUG },
    // welcomeEmailSent en true a propósito: al primer login de un ADMIN con el
    // tenant verificado, auth.routes dispara el correo de bienvenida. El correo
    // del demo no existe, así que sería un envío fallido (o peor, un rebote) por
    // cada demo. Marcarlo como ya enviado apaga ese camino.
    update: { welcomeEmailSent: true },
    create: {
      name: 'Ferretería El Constructor',
      slug: SLUG,
      ownerEmail: EMAIL,
      emailVerifiedAt: new Date(),
      welcomeEmailSent: true,
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

  // Admin del demo (tabla User). Es quien VINCULA la caja: la app arranca en
  // "Configurar dispositivo" pidiendo correo+password, y solo después aparece el
  // PIN pad del Employee. Mismo shape que crea /api/auth/register-tenant.
  //
  // Re-correr el seed RESETEA la contraseña a DEMO_PASSWORD: es una cuenta de
  // demo desechable, y que sea idempotente vale más que conservar un cambio
  // manual que nadie recordaría.
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  await prisma.user.upsert({
    where: { email: EMAIL.toLowerCase() },
    update: { passwordHash, tenantId: tenant.id, restaurantId: restaurant.id, role: 'ADMIN', isActive: true },
    create: {
      tenantId: tenant.id,
      restaurantId: restaurant.id,
      name: 'Demo Ferretería',
      email: EMAIL.toLowerCase(),
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    },
  });

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
  const cats = [...new Set(CATALOG.map((p) => p.cat))];
  const valorInv = CATALOG.reduce((s, p) => s + p.cost * p.stock, 0);
  console.log('\n✅ Demo "Ferretería El Constructor" sembrado');
  console.log(`   restaurantId: ${restaurant.id}`);
  console.log(`   locationId:   ${location.id}`);
  console.log(`   Artículos:    ${CATALOG.length} en ${cats.length} categorías  ·  Listas: ${LISTS.map((l) => l.name).join(', ')}`);
  console.log(`   Con escalón de mayoreo: ${CATALOG.filter((p) => p.tier).length}  ·  por empaque: ${CATALOG.filter((p) => p.unitsPerPackage).length}`);
  console.log(`   Valor del inventario a costo: $${valorInv.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`);
  console.log(`   Inventario bajo: ${bajos}`);
  console.log('\n   Cómo entrar en la caja (DOS pasos, en este orden):');
  console.log(`   1) Configurar dispositivo → ${EMAIL} / ${PASSWORD}`);
  console.log('      (elige la sucursal "Matriz"; esto vincula el equipo y ya no se vuelve a pedir)');
  console.log(`   2) PIN del cajero → ${PIN}`);
  console.log('\n   Guion: escanea 7500000000011 (cemento), cambia a Contratista y compara.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
