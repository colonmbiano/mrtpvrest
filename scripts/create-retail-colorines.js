/**
 * scripts/create-retail-colorines.js
 * 
 * Crea la cuenta tenant, negocio retail, sucursal, accesos y el catálogo completo
 * de 27 productos para "Colorines · Por Encargo" basado en el catálogo oficial de ventas.
 */

require('dotenv').config({ path: 'apps/backend/.env' });
let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch (e) {
  bcrypt = require('../apps/backend/node_modules/bcryptjs');
}
const crypto = require('crypto');
const { prisma, runWithBypass } = require('../packages/database/index.js');
const { syncTenantModuleRows } = require('../apps/backend/src/lib/tenantModules');

const SLUG = 'colorines';
const OWNER_EMAIL = 'colorines@mrtpvrest.com';
const OWNER_PASSWORD = process.env.COLORINES_PASSWORD || 'Colorines2026!';
const PIN = '1234';

const CATEGORIES_DATA = [
  {
    name: 'Detergentes y Suavizantes',
    description: 'Ropa limpia, aroma que encanta',
    sortOrder: 1,
    items: [
      {
        name: 'Cloralex El Rendidor',
        description: 'Blanqueador · 3.7 L',
        price: 64.00,
        sku: 'DET-CLOR-37L',
        barcode: '7501000001014',
        unitOfMeasure: 'PZA',
        brand: 'Cloralex',
      },
      {
        name: 'Persil Eco Power',
        description: 'Detergente líquido · 9 L',
        price: 282.00,
        sku: 'DET-PERS-9L',
        barcode: '7501000001021',
        unitOfMeasure: 'PZA',
        brand: 'Persil',
      },
      {
        name: 'MAS Color',
        description: 'Colores Intensos · 6.64 L',
        price: 207.00,
        sku: 'DET-MASC-664L',
        barcode: '7501000001038',
        unitOfMeasure: 'PZA',
        brand: 'MAS',
      },
      {
        name: 'Suavitel Baby',
        description: 'Suavizante · 3 L',
        price: 90.00,
        sku: 'SUA-BABY-3L',
        barcode: '7501000001045',
        unitOfMeasure: 'PZA',
        brand: 'Suavitel',
      },
      {
        name: 'Suavitel Momentos Mágicos',
        description: 'Abrazos de Amor · 4.8 L',
        price: 145.00,
        sku: 'SUA-MAGI-48L',
        barcode: '7501000001052',
        unitOfMeasure: 'PZA',
        brand: 'Suavitel',
      },
      {
        name: 'Suavitel Cuidado Superior',
        description: 'Fresca Primavera · 4.8 L',
        price: 130.00,
        sku: 'SUA-CSUP-48L',
        barcode: '7501000001069',
        unitOfMeasure: 'PZA',
        brand: 'Suavitel',
      },
    ],
  },
  {
    name: 'Limpieza y Cuidado',
    description: 'Lo esencial para tu casa',
    sortOrder: 2,
    items: [
      {
        name: 'Salvo Power Clean',
        description: 'Lavatrastes líquido · 2.6 L',
        price: 131.00,
        sku: 'LIMP-SALV-26L',
        barcode: '7501000002011',
        unitOfMeasure: 'PZA',
        brand: 'Salvo',
      },
      {
        name: 'Regio Just 1',
        description: 'Papel higiénico · 12 rollos',
        price: 136.00,
        sku: 'LIMP-REGJ-12R',
        barcode: '7501000002028',
        unitOfMeasure: 'PAQUETE',
        brand: 'Regio',
      },
      {
        name: 'Huggies Supreme',
        description: 'Protección Delicada · 960 toallitas',
        price: 549.00,
        sku: 'CUID-HUGG-960T',
        barcode: '7501000002035',
        unitOfMeasure: 'CAJA',
        brand: 'Huggies',
      },
    ],
  },
  {
    name: 'Café y Despensa',
    description: 'El sabor de cada día',
    sortOrder: 3,
    items: [
      {
        name: 'Nescafé Reserva Oaxaca',
        description: 'Café soluble · Frasco de 180 g',
        price: 178.00,
        sku: 'CAF-NESO-180G',
        barcode: '7501000003018',
        unitOfMeasure: 'PZA',
        brand: 'Nescafé',
      },
      {
        name: 'Nescafé Reserva Chiapas',
        description: 'Café soluble · Frasco de 180 g',
        price: 184.00,
        sku: 'CAF-NESC-180G',
        barcode: '7501000003025',
        unitOfMeasure: 'PZA',
        brand: 'Nescafé',
      },
      {
        name: "Nescafé Taster's Choice Descafeinado",
        description: 'Descafeinado · Frasco de 100 g',
        price: 153.00,
        sku: 'CAF-NSTD-100G',
        barcode: '7501000003032',
        unitOfMeasure: 'PZA',
        brand: 'Nescafé',
      },
      {
        name: "Nescafé Taster's Choice Creamy Vainilla",
        description: 'Creamy Vainilla · Frasco de 100 g',
        price: 148.00,
        sku: 'CAF-NSTV-100G',
        barcode: '7501000003049',
        unitOfMeasure: 'PZA',
        brand: 'Nescafé',
      },
      {
        name: 'Sta. María Agua Natural',
        description: 'Paquete de 12 botellas de 1 L',
        price: 86.00,
        sku: 'BEB-STAM-12L',
        barcode: '7501000003056',
        unitOfMeasure: 'PAQUETE',
        brand: 'Sta. María',
      },
      {
        name: 'Mr. Wings Ajo Parmesano',
        description: 'Aderezo · 1 galón',
        price: 373.00,
        sku: 'DES-MRWA-1GAL',
        barcode: '7501000003063',
        unitOfMeasure: 'PZA',
        brand: 'Mr. Wings',
      },
    ],
  },
  {
    name: 'Perfumería',
    description: 'Encuentra tu fragancia',
    sortOrder: 4,
    items: [
      {
        name: 'Nautica Voyage N-83',
        description: 'Eau de Toilette · 100 ml',
        price: 218.00,
        sku: 'PER-NAU83-100M',
        barcode: '7501000004015',
        unitOfMeasure: 'PZA',
        brand: 'Nautica',
      },
      {
        name: 'Nautica Voyage',
        description: 'Eau de Toilette · 100 ml',
        price: 220.00,
        sku: 'PER-NAUV-100M',
        barcode: '7501000004022',
        unitOfMeasure: 'PZA',
        brand: 'Nautica',
      },
      {
        name: 'GUESS Dare',
        description: 'Para hombre · 3.4 oz',
        price: 345.00,
        sku: 'PER-GUSD-34OZ',
        barcode: '7501000004039',
        unitOfMeasure: 'PZA',
        brand: 'GUESS',
      },
      {
        name: 'GUESS para mujer',
        description: 'Spray · 2.5 oz',
        price: 390.00,
        sku: 'PER-GUSM-25OZ',
        barcode: '7501000004046',
        unitOfMeasure: 'PZA',
        brand: 'GUESS',
      },
      {
        name: 'Tommy Hilfiger Tommy',
        description: 'Eau de Toilette · 100 ml',
        price: 638.00,
        sku: 'PER-TOMM-100M',
        barcode: '7501000004053',
        unitOfMeasure: 'PZA',
        brand: 'Tommy Hilfiger',
      },
    ],
  },
  {
    name: 'Belleza y Básicos',
    description: 'Un detalle para ti',
    sortOrder: 5,
    items: [
      {
        name: 'Maybelline Teddy Tint Coquettish',
        description: 'Super Stay · Tono Coquettish · 5 ml',
        price: 117.00,
        sku: 'BEL-MAYB-COQ',
        barcode: '7501000005012',
        unitOfMeasure: 'PZA',
        brand: 'Maybelline',
      },
      {
        name: 'Maybelline Teddy Tint Petalcore',
        description: 'Super Stay · Tono Petalcore · 5 ml',
        price: 117.00,
        sku: 'BEL-MAYB-PET',
        barcode: '7501000005029',
        unitOfMeasure: 'PZA',
        brand: 'Maybelline',
      },
      {
        name: 'Calcetines de trabajo',
        description: 'Negros reforzados · Paquete de 10 pares',
        price: 270.00,
        sku: 'ROPA-CALC-10P',
        barcode: '7501000005036',
        unitOfMeasure: 'PAQUETE',
        brand: 'Genérico',
      },
    ],
  },
  {
    name: 'Licores',
    description: 'Elige tu favorito (Venta a mayores de 18 años)',
    sortOrder: 6,
    items: [
      {
        name: 'Don Julio 70',
        description: 'Tequila cristalino añejo · 700 ml',
        price: 764.00,
        sku: 'LIC-DJ70-700M',
        barcode: '7501000006019',
        unitOfMeasure: 'PZA',
        brand: 'Don Julio',
      },
      {
        name: "Jack Daniel's Old No. 7",
        description: 'Tennessee Whiskey · 700 ml',
        price: 420.00,
        sku: 'LIC-JD07-700M',
        barcode: '7501000006026',
        unitOfMeasure: 'PZA',
        brand: "Jack Daniel's",
      },
      {
        name: "Jack Daniel's Tennessee Honey",
        description: 'Sabor miel · 700 ml',
        price: 447.00,
        sku: 'LIC-JDHO-700M',
        barcode: '7501000006033',
        unitOfMeasure: 'PZA',
        brand: "Jack Daniel's",
      },
      {
        name: "Jack Daniel's Blackberry",
        description: 'Sabor zarzamora · 700 ml',
        price: 443.00,
        sku: 'LIC-JDBL-700M',
        barcode: '7501000006040',
        unitOfMeasure: 'PZA',
        brand: "Jack Daniel's",
      },
    ],
  },
];

async function main() {
  console.log('🚀 Iniciando creación de cuenta para "Colorines · Por Encargo" (Retail)...');

  await runWithBypass(async () => {
    // 1. Plan UNLIMITED / FULL ACCESS
    let plan = await prisma.plan.findFirst({
      where: { name: 'UNLIMITED', isActive: true },
    });
    if (!plan) {
      plan = await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { price: 'desc' } });
    }

    const enabledModules = [
      'inventory',
      'delivery',
      'webstore',
      'kiosk',
      'loyalty',
      'reports',
      'finance',
      'cash_shift',
      'employee_management',
    ];

    // 2. Upsert Tenant
    console.log('📦 1. Configurando Tenant...');
    const tenant = await prisma.tenant.upsert({
      where: { slug: SLUG },
      update: {
        name: 'Colorines · Por Encargo',
        businessType: 'RETAIL',
        isOnboarded: true,
        onboardingDone: true,
        emailVerifiedAt: new Date(),
        hasInventory: true,
        hasDelivery: true,
        hasWebStore: true,
        enabledModules,
        activeModules: enabledModules,
      },
      create: {
        name: 'Colorines · Por Encargo',
        slug: SLUG,
        ownerEmail: OWNER_EMAIL,
        businessType: 'RETAIL',
        isOnboarded: true,
        onboardingDone: true,
        emailVerifiedAt: new Date(),
        hasInventory: true,
        hasDelivery: true,
        hasWebStore: true,
        enabledModules,
        activeModules: enabledModules,
      },
    });

    // 3. Sync Tenant Modules
    console.log('🔌 2. Sincronizando módulos del Tenant...');
    await syncTenantModuleRows(prisma, tenant.id, new Set(enabledModules));

    // 4. Subscription
    console.log('💳 3. Configurando suscripción...');
    const now = new Date();
    const future = new Date(now);
    future.setFullYear(future.getFullYear() + 1);

    await prisma.subscription.upsert({
      where: { tenantId: tenant.id },
      update: {
        planId: plan ? plan.id : undefined,
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: future,
      },
      create: {
        tenantId: tenant.id,
        planId: plan ? plan.id : 'cmqj1v15v0000j4ozgcowm02j',
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: future,
        priceSnapshot: plan ? plan.price : 99,
        paymentGateway: 'MANUAL',
      },
    });

    // 5. Restaurant
    console.log('🏪 4. Creando / configurando Negocio Retail...');
    const restaurant = await prisma.restaurant.upsert({
      where: { slug: SLUG },
      update: {
        name: 'Colorines · Por Encargo',
        businessType: 'RETAIL',
        isActive: true,
      },
      create: {
        tenantId: tenant.id,
        name: 'Colorines · Por Encargo',
        slug: SLUG,
        businessType: 'RETAIL',
        isActive: true,
      },
    });

    // 6. Restaurant Config (giro ABARROTES en MRTPV Retail)
    await prisma.restaurantConfig.upsert({
      where: { restaurantId: restaurant.id },
      update: {
        retailGiro: 'ABARROTES',
        currency: 'MXN',
        currencyLocale: 'es-MX',
        isOpen: true,
        pointsPerTen: 1,
        pointsValuePesos: 0.10,
        timezone: 'America/Mexico_City',
        deliveryMode: 'FLAT',
        deliveryBaseFee: 0,
      },
      create: {
        restaurantId: restaurant.id,
        retailGiro: 'ABARROTES',
        currency: 'MXN',
        currencyLocale: 'es-MX',
        isOpen: true,
        pointsPerTen: 1,
        pointsValuePesos: 0.10,
        timezone: 'America/Mexico_City',
        deliveryMode: 'FLAT',
        deliveryBaseFee: 0,
      },
    });

    // 7. Location (Sucursal Mostrador Principal)
    console.log('📍 5. Creando sucursal principal...');
    let location = await prisma.location.findFirst({
      where: { restaurantId: restaurant.id, slug: 'principal' },
    });

    if (!location) {
      location = await prisma.location.create({
        data: {
          restaurantId: restaurant.id,
          name: 'Mostrador Principal',
          slug: 'principal',
          businessType: 'RETAIL',
          hasDelivery: true,
          hasTakeaway: true,
          hasTableMap: false,
          hasOpenTabs: false,
          isActive: true,
        },
      });
    } else {
      location = await prisma.location.update({
        where: { id: location.id },
        data: {
          name: 'Mostrador Principal',
          businessType: 'RETAIL',
          hasDelivery: true,
          hasTakeaway: true,
          hasTableMap: false,
          hasOpenTabs: false,
          isActive: true,
        },
      });
    }

    // Configuración remota TPV y Ticket
    await prisma.tpvRemoteConfig.upsert({
      where: { locationId: location.id },
      update: { allowedOrderTypes: ['TAKEOUT', 'DELIVERY'] },
      create: { locationId: location.id, allowedOrderTypes: ['TAKEOUT', 'DELIVERY'] },
    });

    await prisma.ticketConfig.upsert({
      where: { locationId: location.id },
      update: {
        businessName: 'Colorines',
        header: 'Colorines · Por Encargo',
        footer: 'Precios en MXN · ¡Gracias por su preferencia!',
      },
      create: {
        locationId: location.id,
        businessName: 'Colorines',
        header: 'Colorines · Por Encargo',
        footer: 'Precios en MXN · ¡Gracias por su preferencia!',
      },
    });

    // 8. User (Admin / Dueño)
    console.log('👤 6. Creando usuario dueño/administrador...');
    const passwordHash = await bcrypt.hash(OWNER_PASSWORD, 12);
    const user = await prisma.user.upsert({
      where: { email: OWNER_EMAIL },
      update: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        name: 'Administrador Colorines',
        passwordHash,
        role: 'ADMIN',
        isActive: true,
      },
      create: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        email: OWNER_EMAIL,
        name: 'Administrador Colorines',
        passwordHash,
        role: 'ADMIN',
        isActive: true,
      },
    });

    // 9. Employee para TPV / Retail
    console.log('🔑 7. Configurando empleado y PIN de caja...');
    const pinHash = await bcrypt.hash(PIN, 10);
    const offlinePin = crypto.createHash('sha256').update(PIN).digest('hex');

    let employee = await prisma.employee.findFirst({
      where: { locationId: location.id, name: 'Cajero Mostrador' },
    });

    if (!employee) {
      employee = await prisma.employee.create({
        data: {
          locationId: location.id,
          name: 'Cajero Mostrador',
          pin: pinHash,
          offlinePin: offlinePin,
          role: 'ADMIN',
          isActive: true,
          canCharge: true,
          canDiscount: true,
          canModifyTickets: true,
          canDeleteTickets: true,
          canConfigSystem: true,
          canTakeDelivery: true,
          canTakeTakeout: true,
          canManageShifts: true,
          canCancelItems: true,
          canApplyDiscounts: true,
          canReopenTables: true,
          canManageUsers: true,
        },
      });
    } else {
      employee = await prisma.employee.update({
        where: { id: employee.id },
        data: {
          pin: pinHash,
          offlinePin: offlinePin,
          isActive: true,
        },
      });
    }

    // 10. Catálogo: Categories + MenuItems + RetailProduct + RetailSku + Stock
    console.log('🛒 8. Importando catálogo de 27 productos retail en 6 categorías...');

    let totalMenuItems = 0;
    let totalRetailSkus = 0;

    for (const catData of CATEGORIES_DATA) {
      // Upsert Category
      let category = await prisma.category.findFirst({
        where: { restaurantId: restaurant.id, name: catData.name },
      });

      if (!category) {
        category = await prisma.category.create({
          data: {
            restaurantId: restaurant.id,
            name: catData.name,
            description: catData.description,
            sortOrder: catData.sortOrder,
            isActive: true,
          },
        });
      } else {
        category = await prisma.category.update({
          where: { id: category.id },
          data: {
            description: catData.description,
            sortOrder: catData.sortOrder,
            isActive: true,
          },
        });
      }

      for (const item of catData.items) {
        // A) MenuItem (para TPV, Tienda en Línea Web, WhatsApp, Kiosko)
        const menuItem = await prisma.menuItem.upsert({
          where: {
            // MenuItem no tiene un unique natural por nombre en restaurantId directo, usamos findFirst
            id: (await prisma.menuItem.findFirst({
              where: { restaurantId: restaurant.id, name: item.name },
              select: { id: true },
            }))?.id || 'new-menu-item-' + item.sku,
          },
          update: {
            categoryId: category.id,
            name: item.name,
            description: item.description,
            price: item.price,
            isAvailable: true,
            availableOnline: true,
            availableOnKiosk: true,
          },
          create: {
            restaurantId: restaurant.id,
            categoryId: category.id,
            name: item.name,
            description: item.description,
            price: item.price,
            isAvailable: true,
            availableOnline: true,
            availableOnKiosk: true,
          },
        });
        totalMenuItems++;

        // B) RetailProduct (para módulo retail con control de inventario SKU y escáner de código de barras)
        let retailProd = await prisma.retailProduct.findFirst({
          where: { restaurantId: restaurant.id, name: item.name },
        });

        if (!retailProd) {
          retailProd = await prisma.retailProduct.create({
            data: {
              restaurantId: restaurant.id,
              name: item.name,
              description: item.description,
              category: catData.name,
              brand: item.brand,
              isActive: true,
            },
          });
        } else {
          retailProd = await prisma.retailProduct.update({
            where: { id: retailProd.id },
            data: {
              description: item.description,
              category: catData.name,
              brand: item.brand,
              isActive: true,
            },
          });
        }

        // C) RetailSku (desglosamos presentación y contenido desde description "Tipo · Contenido")
        const parts = (item.description || '').split('·').map((s) => s.trim()).filter(Boolean);
        const contentSize = parts.length > 1 ? parts[parts.length - 1] : (parts[0] || null);
        const presentation = parts.length > 1 ? parts.slice(0, -1).join(' · ') : catData.name;
        const skuData = {
          productId: retailProd.id,
          sku: item.sku,
          barcode: item.barcode,
          size: contentSize,
          color: presentation,
          material: catData.name,
          style: item.description,
          price: item.price,
          cost: Math.round(item.price * 0.70 * 100) / 100, // Costo estimado al 70%
          unitOfMeasure: item.unitOfMeasure,
          isActive: true,
        };

        const retailSku = await prisma.retailSku.upsert({
          where: {
            restaurantId_sku: {
              restaurantId: restaurant.id,
              sku: item.sku,
            },
          },
          update: skuData,
          create: {
            restaurantId: restaurant.id,
            ...skuData,
          },
        });
        totalRetailSkus++;

        // D) RetailStockByLocation (Stock inicial de 50 piezas por producto)
        await prisma.retailStockByLocation.upsert({
          where: {
            locationId_skuId: {
              locationId: location.id,
              skuId: retailSku.id,
            },
          },
          update: {
            qty: 50,
          },
          create: {
            restaurantId: restaurant.id,
            locationId: location.id,
            skuId: retailSku.id,
            qty: 50,
            minQty: 5,
          },
        });
      }
    }

    console.log('\n======================================================');
    console.log('✅ CUENTA RETAIL CREADA CON ÉXITO');
    console.log('======================================================');
    console.log(`Negocio:            Colorines · Por Encargo`);
    console.log(`Slug:               ${SLUG}`);
    console.log(`Email Administrador: ${OWNER_EMAIL}`);
    console.log(`Contraseña:         ${OWNER_PASSWORD}`);
    console.log(`Sucursal:           ${location.name} (${location.id})`);
    console.log(`PIN TPV / Cajero:   ${PIN}`);
    console.log(`Categorías creadas: ${CATEGORIES_DATA.length}`);
    console.log(`MenuItems creados:  ${totalMenuItems}`);
    console.log(`Retail SKUs:        ${totalRetailSkus} (con stock inicial de 50 unidades cada uno)`);
    console.log('------------------------------------------------------');
    console.log(`Panel Admin:        https://admin.mrtpvrest.com`);
    console.log(`Punto de Venta TPV: https://tpv.mrtpvrest.com`);
    console.log(`Tienda en Línea:    https://${SLUG}.mrtpvrest.com (o vía ?r=${SLUG})`);
    console.log('======================================================\n');
  });
}

main()
  .catch((err) => {
    console.error('❌ Error al crear la cuenta retail:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
