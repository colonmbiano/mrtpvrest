const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Buscar .env en varias rutas posibles
const envPaths = [
  path.join(__dirname, '../../apps/backend/.env'),
  path.join(process.cwd(), 'apps/backend/.env'),
  path.join(process.cwd(), '.env')
];

let envLoaded = false;
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    console.log(`📝 .env cargado desde: ${p}`);
    envLoaded = true;
    break;
  }
}

if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL no encontrada en el entorno ni en .env');
  process.exit(1);
}

const { PrismaClient } = require('@prisma/client');

async function listTenants() {
  console.log('🔍 Buscando Tenants, Restaurantes y Sucursales...\n');
  
  const prisma = new PrismaClient();
  
  try {
    const tenants = await prisma.tenant.findMany({
      include: {
        restaurants: {
          include: {
            locations: true
          }
        }
      }
    });

    if (tenants.length === 0) {
      console.log('❌ No se encontraron tenants en la base de datos.');
      return;
    }

    tenants.forEach(tenant => {
      console.log(`🏢 Tenant: ${tenant.name} (${tenant.id})`);
      tenant.restaurants.forEach(rest => {
        console.log(`  🍴 Restaurante: ${rest.name} (${rest.id})`);
        rest.locations.forEach(loc => {
          console.log(`    📍 Sucursal: ${loc.name} (${loc.id})`);
          console.log(`       - Slug: ${loc.slug}`);
        });
      });
      console.log('-----------------------------------');
    });

    const employees = await prisma.employee.findMany({
      take: 10,
      select: {
        id: true,
        name: true,
        role: true,
        locationId: true
      }
    });

    console.log('\n👥 Empleados (Muestra):');
    employees.forEach(e => {
      console.log(`- ${e.name} (${e.role}) | Loc: ${e.locationId} | ID: ${e.id}`);
    });

  } catch (error) {
    console.error('❌ Error al listar:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

listTenants();
