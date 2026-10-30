'use strict';
// Seed SINTÉTICO para la copia local del marketplace (MARKETPLACE-STAGING.md).
// Crea tenants/tiendas ficticias e identificadas como tales para probar el
// catálogo con datos. Se niega a correr contra cualquier base que no sea la
// local del marketplace. Idempotente: re-ejecutarlo actualiza, no duplica.
//
//   node apps/backend/scripts/marketplace-seed-synthetic.js
//
// Imprime al final el valor sugerido de MARKETPLACE_STORE_SLUGS.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid');
if (url.hostname !== '127.0.0.1' || url.port !== '55432' || !url.pathname.includes('marketplace')) {
  console.error('Seed sintético rechazado: DATABASE_URL no es la base local del marketplace (127.0.0.1:55432).');
  process.exit(1);
}

const { prisma, runWithBypass } = require('@mrtpvrest/database');

const TYPES = ['RESTAURANT', 'RETAIL', 'GROCERY'];
// 13 tiendas visibles (más de una página de 12) y una inactiva que debe quedar fuera.
const STORES = Array.from({ length: 14 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return {
    slug: `mkt-sintetica-${n}`,
    name: `Tienda Sintética ${n}`,
    businessType: i === 0 ? 'RESTAURANT' : i === 1 ? 'GROCERY' : TYPES[i % 3],
    isActive: i !== 13,
  };
});

// Tienda 01: 14 productos visibles (más de una página) en dos categorías.
// Tienda 02: uno visible, uno oculto online, uno no disponible y uno en categoría inactiva.
const PRODUCTS = {
  'mkt-sintetica-01': [
    { category: 'Tacos (demo)', items: ['Taco al pastor', 'Taco de suadero', 'Taco de bistec', 'Taco campechano',
      'Taco de chorizo', 'Taco de longaniza', 'Taco de tripa', 'Taco de cabeza'] },
    { category: 'Bebidas (demo)', items: ['Agua de horchata', 'Agua de jamaica', 'Agua de tamarindo',
      'Refresco de cola', 'Café de olla', 'Té de canela'] },
  ],
  'mkt-sintetica-02': [
    { category: 'Abarrotes (demo)', items: ['Pan dulce surtido'] },
    { category: 'Abarrotes (demo)', items: ['Leche entera'], availableOnline: false },
    { category: 'Abarrotes (demo)', items: ['Huevo blanco docena'], isAvailable: false },
    { category: 'Temporada (demo, inactiva)', categoryActive: false, items: ['Rosca de reyes'] },
  ],
};

// Condiciones de entrega por tienda (índice = tienda - 1). Cubren envío fijo,
// gratis, por distancia, una tienda cerrada a mano y una sin configuración
// (el storefront y el catálogo la muestran cerrada). La 14 está inactiva.
const TERMS = [
  { estimatedDelivery: 30, deliveryFee: 19, freeDeliveryFrom: 250, minOrderAmount: 80 },
  { estimatedDelivery: 25, deliveryFee: 0, freeDeliveryFrom: null, minOrderAmount: 100 },
  { estimatedDelivery: 35, deliveryFee: 25, freeDeliveryFrom: 300, minOrderAmount: 120 },
  { estimatedDelivery: 20, deliveryFee: 15, freeDeliveryFrom: 180, minOrderAmount: 60 },
  { estimatedDelivery: 40, deliveryFee: 29, freeDeliveryFrom: 350, minOrderAmount: 150, isOpen: false, closedMessage: 'Abrimos mañana a las 11:00' },
  { estimatedDelivery: 45, deliveryFee: 35, freeDeliveryFrom: 400, minOrderAmount: 150 },
  { estimatedDelivery: 30, deliveryFee: 0, freeDeliveryFrom: null, minOrderAmount: 90 },
  { estimatedDelivery: 25, deliveryFee: 19, freeDeliveryFrom: 220, minOrderAmount: 90 },
  { estimatedDelivery: 35, deliveryFee: 25, freeDeliveryFrom: null, minOrderAmount: 100 },
  { estimatedDelivery: 50, deliveryFee: 39, freeDeliveryFrom: 500, minOrderAmount: 200 },
  { estimatedDelivery: 28, deliveryFee: 20, freeDeliveryFrom: 250, minOrderAmount: 70 },
  { estimatedDelivery: 35, deliveryMode: 'DISTANCE', deliveryBaseFee: 15, deliveryPerKm: 6, minOrderAmount: 100 },
  null,
  null,
];

// Promos vigentes (precio especial) y "me gusta" sintéticos por producto.
const PROMOS = { 'Taco campechano': 25, 'Agua de horchata': 39 };
const LIKES = { 'Taco al pastor': 42, 'Taco de suadero': 18, 'Agua de horchata': 9, 'Pan dulce surtido': 12 };

async function upsertStore(store) {
  const tenant = await prisma.tenant.upsert({
    where: { slug: store.slug },
    update: { name: store.name, hasWebStore: true, isDemo: false },
    create: {
      slug: store.slug, name: store.name, hasWebStore: true, isDemo: false,
      ownerEmail: `${store.slug}@example.invalid`,
    },
  });
  return prisma.restaurant.upsert({
    where: { slug: store.slug },
    update: { name: store.name, businessType: store.businessType, isActive: store.isActive, tenantId: tenant.id },
    create: {
      slug: store.slug, name: store.name, businessType: store.businessType,
      isActive: store.isActive, tenantId: tenant.id,
    },
  });
}

async function seedProducts(restaurant, groups) {
  let price = 18;
  for (const group of groups) {
    const category = await prisma.category.findFirst({ where: { restaurantId: restaurant.id, name: group.category } })
      ?? await prisma.category.create({ data: { restaurantId: restaurant.id, name: group.category } });
    await prisma.category.update({ where: { id: category.id }, data: { isActive: group.categoryActive !== false } });
    for (const name of group.items) {
      price += 3.5;
      const data = {
        restaurantId: restaurant.id, categoryId: category.id, name, price,
        isAvailable: group.isAvailable !== false, availableOnline: group.availableOnline !== false,
        isPromo: name in PROMOS, promoPrice: PROMOS[name] ?? null,
      };
      const existing = await prisma.menuItem.findFirst({ where: { restaurantId: restaurant.id, name } });
      const item = existing
        ? await prisma.menuItem.update({ where: { id: existing.id }, data })
        : await prisma.menuItem.create({ data });
      if (LIKES[name]) {
        await prisma.dishReaction.createMany({
          data: Array.from({ length: LIKES[name] }, (_, i) => ({ restaurantId: restaurant.id, menuItemId: item.id, clientId: `seed-${i}` })),
          skipDuplicates: true,
        });
      }
    }
  }
}

async function main() {
  await runWithBypass(async () => {
    for (const store of STORES) {
      const restaurant = await upsertStore(store);
      if (PRODUCTS[store.slug]) await seedProducts(restaurant, PRODUCTS[store.slug]);
    }
    // Configuración de entrega (MXN) según TERMS. Sin entrada, la tienda queda
    // sin config y se muestra cerrada, lo que cubre también esa rama.
    for (const [i, store] of STORES.entries()) {
      const terms = TERMS[i];
      if (!terms) continue;
      const restaurant = await prisma.restaurant.findUnique({ where: { slug: store.slug } });
      const data = { currency: 'MXN', isOpen: true, closedMessage: null, deliveryMode: 'FLAT', ...terms };
      await prisma.restaurantConfig.upsert({
        where: { restaurantId: restaurant.id },
        update: data,
        create: { restaurantId: restaurant.id, ...data },
      });
    }
  });
  console.log(`Seed sintético aplicado: ${STORES.length} tiendas (1 inactiva).`);
  console.log(`MARKETPLACE_STORE_SLUGS=${STORES.map(s => s.slug).join(',')}`);
}

main()
  .catch((error) => { console.error('Seed sintético falló:', error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
