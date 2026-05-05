/**
 * seed-bubblelab.js
 * Crea la tienda de pruebas "BubbleLab 🧋" en la base de datos.
 * Ejecutar: node scratch/seed-bubblelab.js
 */

const bcrypt = require('../apps/backend/node_modules/bcryptjs');
const crypto = require('crypto');
const { prisma } = require('../packages/database');


// ── Helpers ────────────────────────────────────────────────────────────
const hashPin = (pin) => bcrypt.hash(pin, 10);
const sha256Pin = (pin) => crypto.createHash('sha256').update(pin).digest('hex');
const hashPass = (pass) => bcrypt.hash(pass, 12);

// ══════════════════════════════════════════════════════════════════════
//  DATOS DE LA TIENDA
// ══════════════════════════════════════════════════════════════════════

const STORE = {
  tenant: {
    name: 'BubbleLab',
    slug: 'bubblelab',
    ownerEmail: 'owner@bubblelab.mx',
    businessType: 'RESTAURANT',
  },
  restaurant: {
    name: 'BubbleLab 🧋',
    slug: 'bubblelab-store',
  },
  location: {
    name: 'Sucursal Centro',
    slug: 'centro',
    address: 'Av. Insurgentes Sur 100, CDMX',
    phone: '55-1234-5678',
  },
  owner: {
    name: 'Valentina Cruz Soto',
    email: 'owner@bubblelab.mx',
    password: 'BubbleLab2024!',
    role: 'ADMIN',
  },
};

// ── Empleados con PIN ─────────────────────────────────────────────────
const EMPLOYEES = [
  {
    name: 'Sofía Ramírez',
    phone: '5511223344',
    role: 'ADMIN',
    pin: '1111',
    canCharge: true,
    canDiscount: true,
    canModifyTickets: true,
    canDeleteTickets: true,
    canConfigSystem: true,
    canTakeDelivery: true,
    canTakeTakeout: true,
    canManageShifts: true,
  },
  {
    name: 'Diego Torres',
    phone: '5598765432',
    role: 'CASHIER',
    pin: '2222',
    canCharge: true,
    canDiscount: true,
    canModifyTickets: true,
    canDeleteTickets: false,
    canConfigSystem: false,
    canTakeDelivery: false,
    canTakeTakeout: true,
    canManageShifts: true,
  },
  {
    name: 'Carlos Medina',
    phone: '5544332211',
    role: 'DELIVERY',
    pin: '3333',
    canCharge: true,
    canDiscount: false,
    canModifyTickets: false,
    canDeleteTickets: false,
    canConfigSystem: false,
    canTakeDelivery: true,
    canTakeTakeout: false,
    canManageShifts: false,
  },
];

// ── Categorías ────────────────────────────────────────────────────────
const CATEGORIES = [
  { name: 'Tés de Leche', sortOrder: 0 },
  { name: 'Tés Frutales', sortOrder: 1 },
  { name: 'Especialidades', sortOrder: 2 },
];

// ── 10 Productos del menú ─────────────────────────────────────────────
const MENU_ITEMS = [
  // Tés de Leche
  {
    category: 'Tés de Leche',
    name: 'Classic Milk Tea',
    description: 'Té negro de Ceilán con leche cremosa y perlas de tapioca. El favorito de todos.',
    price: 65,
    isPopular: true,
  },
  {
    category: 'Tés de Leche',
    name: 'Matcha Boba Latte',
    description: 'Matcha ceremonial japonés con leche de avena y perlas de tapioca negra.',
    price: 75,
    isPopular: true,
  },
  {
    category: 'Tés de Leche',
    name: 'Taro Milk Tea',
    description: 'Suave y cremoso, con sabor a taro morado y perlas de tapioca. Sin colorantes artificiales.',
    price: 72,
    isPopular: false,
  },
  {
    category: 'Tés de Leche',
    name: 'Brown Sugar Boba',
    description: 'Leche fresca con jarabe de azúcar morena artesanal y perlas caramelizadas. El más instagrameable.',
    price: 80,
    isPopular: true,
    isPromo: true,
    promoPrice: 70,
  },

  // Tés Frutales
  {
    category: 'Tés Frutales',
    name: 'Mango Passion Fruit Tea',
    description: 'Té verde con mango fresco, maracuyá y perlas de fruta de colores.',
    price: 68,
    isPopular: false,
  },
  {
    category: 'Tés Frutales',
    name: 'Strawberry Lychee Green Tea',
    description: 'Té verde con fresa natural y lychee, refrescante y ligeramente dulce.',
    price: 65,
    isPopular: false,
  },
  {
    category: 'Tés Frutales',
    name: 'Hibiscus Berry Slush',
    description: 'Jamaica fría con mora azul, frambuesa y perlas de popping de fresa. Antioxidante.',
    price: 70,
    isPopular: true,
  },

  // Especialidades
  {
    category: 'Especialidades',
    name: 'Thai Tea Boba',
    description: 'Té tailandés con leche condensada, naranja y perlas de tapioca. Receta original de Bangkok.',
    price: 70,
    isPopular: false,
  },
  {
    category: 'Especialidades',
    name: 'Tiger Sugar Cheese Foam',
    description: 'Té negro con espuma de queso crema suave, jarabe de azúcar morena. Tendencia viral de Asia.',
    price: 85,
    isPopular: true,
  },
  {
    category: 'Especialidades',
    name: 'Oolong Salted Caramel',
    description: 'Oolong premium con caramelo salado y espuma de leche. Equilibrio perfecto entre dulce y salado.',
    price: 78,
    isPopular: false,
  },
];

// ══════════════════════════════════════════════════════════════════════
//  SEED
// ══════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n🧋 Iniciando seed de BubbleLab...\n');

  // 1. Tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: STORE.tenant.slug },
    create: {
      name: STORE.tenant.name,
      slug: STORE.tenant.slug,
      ownerEmail: STORE.tenant.ownerEmail,
      businessType: STORE.tenant.businessType,
      isOnboarded: true,
      onboardingDone: true,
      hasDelivery: true,
      hasWebStore: true,
      activeModules: JSON.stringify(['pos', 'delivery', 'kds']),
      emailVerifiedAt: new Date(), // Bypass verificación para seeds de prueba
      emailVerificationToken: null,
      emailVerificationExpiry: null,
    },
    update: { 
      isOnboarded: true, 
      onboardingDone: true,
      emailVerifiedAt: new Date(),
      emailVerificationToken: null,
      emailVerificationExpiry: null,
    },
  });
  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`);

  // 2. Restaurant
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: STORE.restaurant.slug },
    create: {
      tenantId: tenant.id,
      slug: STORE.restaurant.slug,
      name: STORE.restaurant.name,
      businessType: 'RESTAURANT',
      isActive: true,
    },
    update: {},
  });
  console.log(`✅ Restaurante: ${restaurant.name} (${restaurant.id})`);

  // 3. Location
  const location = await prisma.location.upsert({
    where: { restaurantId_slug: { restaurantId: restaurant.id, slug: STORE.location.slug } },
    create: {
      restaurantId: restaurant.id,
      name: STORE.location.name,
      slug: STORE.location.slug,
      address: STORE.location.address,
      phone: STORE.location.phone,
      isActive: true,
    },
    update: {},
  });
  console.log(`✅ Sucursal: ${location.name} (${location.id})`);

  // 4. Usuario propietario
  const passwordHash = await hashPass(STORE.owner.password);
  const owner = await prisma.user.upsert({
    where: { email: STORE.owner.email },
    create: {
      name: STORE.owner.name,
      email: STORE.owner.email,
      passwordHash,
      role: 'ADMIN',
      tenantId: tenant.id,
      restaurantId: restaurant.id,
      isActive: true,
    },
    update: { restaurantId: restaurant.id, tenantId: tenant.id },
  });
  console.log(`✅ Usuario propietario: ${owner.email}`);

  // 5. Empleados con PIN
  console.log('\n👥 Creando empleados...');
  for (const emp of EMPLOYEES) {
    // Verificar si ya existe un empleado con ese PIN en la sucursal
    const pinHash = await hashPin(emp.pin);
    const offlinePin = sha256Pin(emp.pin);

    const existing = await prisma.employee.findFirst({
      where: { locationId: location.id, name: emp.name }
    });

    if (!existing) {
      await prisma.employee.create({
        data: {
          locationId: location.id,
          name: emp.name,
          phone: emp.phone,
          pin: pinHash,
          offlinePin,
          role: emp.role,
          isActive: true,
          canCharge: emp.canCharge,
          canDiscount: emp.canDiscount,
          canModifyTickets: emp.canModifyTickets,
          canDeleteTickets: emp.canDeleteTickets,
          canConfigSystem: emp.canConfigSystem,
          canTakeDelivery: emp.canTakeDelivery,
          canTakeTakeout: emp.canTakeTakeout,
          canManageShifts: emp.canManageShifts,
        }
      });
      console.log(`  ✅ ${emp.role}: ${emp.name} | PIN: ${emp.pin}`);
    } else {
      console.log(`  ⏭️  ${emp.name} ya existe, omitiendo`);
    }
  }

  // 6. Categorías
  console.log('\n📂 Creando categorías...');
  const categoryMap = {};
  for (const cat of CATEGORIES) {
    const existing = await prisma.category.findFirst({
      where: { restaurantId: restaurant.id, name: cat.name }
    });
    const category = existing || await prisma.category.create({
      data: {
        restaurantId: restaurant.id,
        name: cat.name,
        sortOrder: cat.sortOrder,
        isActive: true,
      }
    });
    categoryMap[cat.name] = category.id;
    console.log(`  ✅ ${cat.name}`);
  }

  // 7. Menu Items
  console.log('\n🥤 Creando productos del menú...');
  for (const item of MENU_ITEMS) {
    const existing = await prisma.menuItem.findFirst({
      where: { restaurantId: restaurant.id, name: item.name }
    });
    if (!existing) {
      await prisma.menuItem.create({
        data: {
          restaurantId: restaurant.id,
          categoryId: categoryMap[item.category],
          name: item.name,
          description: item.description,
          price: item.price,
          isAvailable: true,
          isPopular: item.isPopular || false,
          isPromo: item.isPromo || false,
          promoPrice: item.promoPrice || null,
          preparationTime: 5,
        }
      });
      const promoLabel = item.isPromo ? ` 🏷️ PROMO $${item.promoPrice}` : '';
      console.log(`  ✅ ${item.name} — $${item.price}${promoLabel}`);
    } else {
      console.log(`  ⏭️  ${item.name} ya existe`);
    }
  }

  // ── Resumen final ──────────────────────────────────────────────────
  console.log(`
╔══════════════════════════════════════════════════╗
║          🧋 BubbleLab — CREDENCIALES             ║
╠══════════════════════════════════════════════════╣
║  PANEL ADMIN (admin.mrtpvrest.com)               ║
║  Email   : owner@bubblelab.mx                    ║
║  Password: BubbleLab2024!                        ║
╠══════════════════════════════════════════════════╣
║  TPV — LOGIN POR PIN                             ║
║  Sofía Ramírez  (ADMIN)     PIN: 1111            ║
║  Diego Torres   (CAJERO)    PIN: 2222            ║
║  Carlos Medina  (DELIVERY)  PIN: 3333            ║
╠══════════════════════════════════════════════════╣
║  RESTAURANT ID: ${restaurant.id.slice(0, 26)}...  ║
║  LOCATION  ID : ${location.id.slice(0, 26)}...  ║
╚══════════════════════════════════════════════════╝
`);
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
