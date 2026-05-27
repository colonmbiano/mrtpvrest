// prisma/seed-tiers.js — Seed de los 3 tiers recomendados (BASIC/PRO/PREMIUM).
// Upsert por `name` — corrible varias veces sin duplicar. Reemplaza
// /planes "PAL APURO" demo si lo encuentra (lo desactiva, no lo borra).
//
// Uso:
//   cd packages/database
//   node prisma/seed-tiers.js
//
// Después, en /planes del super-admin panel, podrás editar precios o
// agregar stripePriceId cuando crees los Productos en Stripe Dashboard.

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const TIERS = [
  {
    name: 'BASIC',
    displayName: 'Básico',
    price: 299,
    trialDays: 15,
    maxLocations: 1,
    maxEmployees: 5,
    // Features premium: TODO OFF
    hasKDS:       false,
    hasInventory: false,
    hasLoyalty:   false,
    hasReports:   false,
    hasAPIAccess: false,
    // Módulos: foundation operativa
    allowedModules: [
      'pos_standard',
      'employee_management',
      'cash_shift',
      'client_menu',
      'waiters',
    ],
    isActive: true,
  },
  {
    name: 'PRO',
    displayName: 'Pro',
    price: 599,
    trialDays: 15,
    maxLocations: 3,
    maxEmployees: 25,
    // Features premium: inventario + reportes + KDS
    hasKDS:       true,
    hasInventory: true,
    hasLoyalty:   false,
    hasReports:   true,
    hasAPIAccess: false,
    allowedModules: [
      'pos_standard',
      'employee_management',
      'cash_shift',
      'client_menu',
      'waiters',
      'kds',
      'delivery',
      'inventory',
      'reports',
      'finance',
    ],
    isActive: true,
  },
  {
    name: 'PREMIUM',
    displayName: 'Premium',
    price: 1299,
    trialDays: 15,
    maxLocations: 999,
    maxEmployees: 999,
    // Features premium: TODAS ON
    hasKDS:       true,
    hasInventory: true,
    hasLoyalty:   true,
    hasReports:   true,
    hasAPIAccess: true,
    // Todos los módulos
    allowedModules: [
      'pos_standard',
      'employee_management',
      'cash_shift',
      'client_menu',
      'waiters',
      'kds',
      'delivery',
      'inventory',
      'kiosk',
      'loyalty_advanced',
      'multi_currency',
      'reports',
      'finance',
    ],
    isActive: true,
  },
];

async function main() {
  console.log('🌱 Sembrando 3 tiers recomendados (BASIC / PRO / PREMIUM)...\n');

  // 1. Desactivar planes legacy que no estén en TIERS para evitar confusión.
  //    No los borramos — pueden estar referenciados por subscriptions vivas.
  const tierNames = TIERS.map(t => t.name);
  const legacy = await prisma.plan.findMany({
    where: { name: { notIn: tierNames }, isActive: true },
    select: { id: true, name: true, displayName: true },
  });
  for (const p of legacy) {
    await prisma.plan.update({ where: { id: p.id }, data: { isActive: false } });
    console.log(`  💤 Desactivado plan legacy: ${p.displayName} (${p.name})`);
  }
  if (legacy.length === 0) console.log('  (sin planes legacy que desactivar)\n');

  // 2. Upsert los 3 tiers
  for (const tier of TIERS) {
    const upserted = await prisma.plan.upsert({
      where: { name: tier.name },
      create: tier,
      update: {
        displayName:    tier.displayName,
        price:          tier.price,
        trialDays:      tier.trialDays,
        maxLocations:   tier.maxLocations,
        maxEmployees:   tier.maxEmployees,
        hasKDS:         tier.hasKDS,
        hasInventory:   tier.hasInventory,
        hasLoyalty:     tier.hasLoyalty,
        hasReports:     tier.hasReports,
        hasAPIAccess:   tier.hasAPIAccess,
        allowedModules: tier.allowedModules,
        isActive:       true,
      },
    });
    const featureCount = ['hasKDS','hasInventory','hasLoyalty','hasReports','hasAPIAccess']
      .filter(k => tier[k]).length;
    console.log(
      `  ✅ ${tier.displayName.padEnd(8)} · $${tier.price}/mes · ` +
      `${tier.maxLocations === 999 ? '∞' : tier.maxLocations} suc · ` +
      `${tier.maxEmployees === 999 ? '∞' : tier.maxEmployees} emp · ` +
      `${featureCount}/5 features · ${tier.allowedModules.length} módulos · ` +
      `id=${upserted.id.slice(-8)}`
    );
  }

  // 3. Summary
  console.log('\n📊 Estado final:');
  const all = await prisma.plan.findMany({ orderBy: [{ isActive: 'desc' }, { price: 'asc' }] });
  for (const p of all) {
    const status = p.isActive ? '🟢' : '⚪';
    console.log(`  ${status} ${p.displayName.padEnd(10)} · ${p.name.padEnd(10)} · $${p.price}/mes ${p.isActive ? '' : '(inactivo)'}`);
  }

  console.log('\n🎉 Listo. Próximos pasos:');
  console.log('  1. Abre /planes en el panel super-admin para ajustar precios si quieres.');
  console.log('  2. Crea los Productos+Prices en Stripe Dashboard.');
  console.log('  3. Copia los price_xxx al campo "Stripe Price ID" de cada plan.');
  console.log('  4. Cuando todo esté correcto, en Railway → ENFORCE_PLAN_FLAGS=true');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
