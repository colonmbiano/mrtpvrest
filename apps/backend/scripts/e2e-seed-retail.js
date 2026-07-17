/**
 * Seed E2E del módulo retail multigiro (ferretería).
 *
 * Va aparte de `prisma/seed.ts` a propósito: ése siembra el tenant de
 * restaurante que usan los specs 01-07 y también sirve para dev. Aquí solo se
 * crea lo mínimo para ejercitar ferretería, y el spec 08 no depende del otro.
 *
 * Idempotente (upsert por slug / clave natural): el workflow lo corre en cada
 * run y localmente se puede repetir sin ensuciar.
 *
 * Deja los ids en tests/e2e/.auth/moda.json (gitignored) porque el spec necesita
 * restaurantId/locationId para vincular el dispositivo, igual que auth.setup.ts
 * hace con admin.json.
 *
 * Los datos NO son decorativos: cada SKU existe para probar una regla concreta
 * que se puede romper en silencio. Ver los comentarios de SKUS.
 */
const { prisma } = require('@mrtpvrest/database');
const fs = require('fs');
const path = require('path');

const SLUG = 'ferreteria-e2e';
const PIN = process.env.RETAIL_PIN || '1234';

// Cada SKU prueba una regla distinta del retail multigiro.
const SKUS = [
  {
    // Escaneo por código de barras: el flujo principal del mostrador. Antes de
    // la Fase 2.0 el barcode ni llegaba al POS (mapCatalogToProducts lo tiraba).
    key: 'pieza',
    sku: 'TOR-HEX-14-2',
    barcode: '7501000000017',
    size: '1/4"', style: 'Estándar', material: 'Acero',
    price: 25, cost: 12,
    unitOfMeasure: 'PZA',
    unitsPerPackage: null,
    qty: 500,
  },
  {
    // Granel: cantidad decimal. El POS debe aceptar 2.5 y descontar 2.5, no 3.
    key: 'granel',
    sku: 'CAB-CAL12-MTS',
    barcode: '7501000000024',
    size: 'Cal. 12', material: 'Cobre',
    price: 18.5, cost: 9,
    unitOfMeasure: 'MTS',
    unitsPerPackage: null,
    qty: 300,
  },
  {
    // Caja↔pieza + mayoreo, juntos a propósito: capturar 2 CAJAS debe mandar
    // 200 PZA (no 2), y esas 200 deben disparar el tier de minQty 100. Si la
    // conversión se duplicara (400) o no ocurriera (2), el total delata cuál.
    key: 'caja',
    sku: 'PIJ-8X1-C100',
    barcode: '7501000000031',
    size: '8x1"', material: 'Galvanizado',
    price: 2.5, cost: 1.1,
    unitOfMeasure: 'PZA',
    unitsPerPackage: 100,
    qty: 1000,
    tier: { minQty: 100, price: 1.8 },
  },
];

async function main() {
  // ── Tenant / restaurante / config / sucursal ───────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: SLUG },
    update: {},
    create: {
      name: 'E2E Ferretería',
      slug: SLUG,
      ownerEmail: 'e2e-ferreteria@mrtpvrest.com',
      emailVerifiedAt: new Date(),
      isOnboarded: true,
      activeModules: JSON.stringify([]),
    },
  });

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: SLUG },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Ferretería E2E',
      slug: SLUG,
      businessType: 'RETAIL',
    },
  });

  // El giro vive aquí, NO en Location.businessType (que es un enum y solo dice
  // "es mostrador"). Ver docs/plan-retail-multigiro.md → "Dónde vive el giro".
  await prisma.restaurantConfig.upsert({
    where: { restaurantId: restaurant.id },
    update: { retailGiro: 'FERRETERIA' },
    create: { restaurantId: restaurant.id, retailGiro: 'FERRETERIA' },
  });

  let location = await prisma.location.findFirst({
    where: { restaurantId: restaurant.id, slug: SLUG },
  });
  if (!location) {
    location = await prisma.location.create({
      data: {
        restaurantId: restaurant.id,
        name: 'Mostrador E2E',
        slug: SLUG,
        businessType: 'RETAIL',
      },
    });
  }

  // El TPV/moda autentica como Employee (no User): un FK a users daría 500.
  let employee = await prisma.employee.findFirst({
    where: { locationId: location.id, name: 'Cajero Ferretería E2E' },
  });
  if (!employee) {
    employee = await prisma.employee.create({
      data: {
        locationId: location.id,
        name: 'Cajero Ferretería E2E',
        pin: PIN,
        role: 'ADMIN', // ADMIN_ROLES: necesario para el CRUD de tiers
        isActive: true,
      },
    });
  }

  // ── Catálogo ───────────────────────────────────────────────────────────────
  let product = await prisma.retailProduct.findFirst({
    where: { restaurantId: restaurant.id, name: 'Surtido Ferretería E2E' },
  });
  if (!product) {
    product = await prisma.retailProduct.create({
      data: {
        restaurantId: restaurant.id,
        name: 'Surtido Ferretería E2E',
        category: 'Fijación',
        brand: 'Genérico',
        isActive: true,
      },
    });
  }

  const ids = {};
  for (const s of SKUS) {
    const data = {
      productId: product.id,
      sku: s.sku,
      barcode: s.barcode,
      size: s.size ?? null,
      style: s.style ?? null,
      material: s.material ?? null,
      price: s.price,
      cost: s.cost,
      unitOfMeasure: s.unitOfMeasure,
      unitsPerPackage: s.unitsPerPackage,
      isActive: true,
    };
    const sku = await prisma.retailSku.upsert({
      where: { restaurantId_sku: { restaurantId: restaurant.id, sku: s.sku } },
      update: data,
      create: { restaurantId: restaurant.id, ...data },
    });
    ids[s.key] = { id: sku.id, sku: s.sku, barcode: s.barcode, price: s.price };

    await prisma.retailStockByLocation.upsert({
      where: { locationId_skuId: { locationId: location.id, skuId: sku.id } },
      update: { qty: s.qty },
      create: {
        restaurantId: restaurant.id,
        locationId: location.id,
        skuId: sku.id,
        qty: s.qty,
        minQty: 0,
      },
    });

    if (s.tier) {
      await prisma.retailPriceTier.upsert({
        where: { skuId_minQty: { skuId: sku.id, minQty: s.tier.minQty } },
        update: { price: s.tier.price },
        create: {
          restaurantId: restaurant.id,
          skuId: sku.id,
          minQty: s.tier.minQty,
          price: s.tier.price,
        },
      });
      ids[s.key].tier = s.tier;
    }
  }

  // ── Salida para el spec ────────────────────────────────────────────────────
  const out = {
    restaurantId: restaurant.id,
    locationId: location.id,
    locationName: location.name,
    restaurantName: restaurant.name,
    giro: 'FERRETERIA',
    pin: PIN,
    skus: ids,
  };
  const file = path.join(__dirname, '../../../tests/e2e/.auth/moda.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2));

  console.log('✅ Seed retail (ferretería) listo');
  console.log(`   restaurantId: ${restaurant.id}`);
  console.log(`   locationId:   ${location.id}`);
  console.log(`   PIN:          ${PIN}`);
  console.log(`   SKUs:         ${SKUS.map((s) => `${s.sku} (${s.unitOfMeasure})`).join(', ')}`);
  console.log(`   → ${file}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
