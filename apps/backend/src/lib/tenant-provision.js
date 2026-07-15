'use strict';

// Núcleo de ALTA DE TENANT usado por el bot de ventas del SaaS
// (sales-bot.routes.js → /provision-tenant), donde Claude cierra la venta y deja
// la cuenta lista sin salir del chat.
//
// IMPORTANTE — ESPEJO DE auth.routes.js: esta función replica EXACTAMENTE el
// alta que hace el registro self-serve (/register-tenant): mismo
// Tenant+Subscription(TRIAL)+Restaurant+Location+categorías de gasto+
// User(ADMIN)+Employee(PIN 1234), misma resolución de plan y misma
// resolveTrialDays. Si cambias el alta en un lado, refléjalo en el otro.
// (Pendiente unificar auth.routes para que llame aquí; se dejó intacto para no
// tocar la ruta crítica de registro sin su suite de integración.)

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { prisma, runWithBypass } = require('@mrtpvrest/database');
const { resolveTrialDays } = require('./promo');

// Error tipado para que los callers mapeen a HTTP (409/400/500) sin adivinar.
class ProvisionError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'ProvisionError';
    this.code = code;
    this.status = status;
  }
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'LUZ',              icon: '💡', color: '#fbbf24' },
  { name: 'AGUA',             icon: '💧', color: '#3b82f6' },
  { name: 'INTERNET',         icon: '📡', color: '#06b6d4' },
  { name: 'GAS',              icon: '🔥', color: '#f97316' },
  { name: 'MANTENIMIENTO',    icon: '🔧', color: '#6b7280' },
  { name: 'SUELDOS',          icon: '💼', color: '#a16207' },
  { name: 'PROPINAS_PAGADAS', icon: '🪙', color: '#84cc16' },
  { name: 'OTROS',            icon: '📝', color: '#9ca3af' },
];

/**
 * Crea un tenant completo y devuelve las entidades + plan/trial.
 *
 * @param {object} opts
 * @param {string} opts.restaurantName
 * @param {string} opts.ownerName
 * @param {string} opts.email
 * @param {string} opts.password        Texto plano; se hashea aquí (bcrypt 12).
 * @param {string} [opts.requestedPlanId]
 * @param {boolean} [opts.enableWebStore] Enciende la tienda online del tenant.
 * @param {boolean} [opts.isDemo]        Marca el tenant como cuenta DEMO (panel SaaS).
 * @param {string}  [opts.businessType]  RESTAURANT | GROCERY | BUTCHER | POULTRY | OTHER.
 * @param {number}  [opts.trialDaysOverride] Fuerza los días de trial (demos: trial corto).
 * @returns {Promise<{tenant,restaurant,user,location,plan,trialDays,trialEndsAt}>}
 * @throws {ProvisionError} EMAIL_TAKEN | SLUG_TAKEN | NO_PLAN | MISSING_FIELDS | WEAK_PASSWORD
 */
async function provisionTenant(opts = {}) {
  const {
    restaurantName,
    ownerName,
    email,
    password,
    requestedPlanId,
    enableWebStore = false,
    isDemo = false,
    businessType = null,
    trialDaysOverride = null,
  } = opts;

  if (!restaurantName || !ownerName || !email || !password)
    throw new ProvisionError('MISSING_FIELDS', 'restaurantName, ownerName, email y password son requeridos');
  if (String(password).length < 8)
    throw new ProvisionError('WEAK_PASSWORD', 'La contraseña debe tener al menos 8 caracteres');

  const emailLower = String(email).toLowerCase();
  const slug = slugify(restaurantName);
  if (!slug) throw new ProvisionError('MISSING_FIELDS', 'El nombre del restaurante no es válido');

  // Validaciones previas. El lookup de email es legítimamente cross-tenant
  // (unique global) → runWithBypass. El slug vive en Tenant (no scopeado).
  const [emailTaken, slugTaken] = await Promise.all([
    runWithBypass(() => prisma.user.findUnique({ where: { email: emailLower } })),
    prisma.tenant.findUnique({ where: { slug } }),
  ]);
  if (emailTaken) throw new ProvisionError('EMAIL_TAKEN', 'Ya existe una cuenta con ese email', 409);
  if (slugTaken)  throw new ProvisionError('SLUG_TAKEN', 'Ese nombre de restaurante ya está registrado', 409);

  // Resolución de plan: el solicitado (si válido) → BASIC → el activo más barato.
  let plan = null;
  if (requestedPlanId) plan = await prisma.plan.findFirst({ where: { id: requestedPlanId, isActive: true } });
  if (!plan) plan = await prisma.plan.findFirst({ where: { name: 'BASIC', isActive: true } });
  if (!plan) plan = await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { price: 'asc' } });
  if (!plan) throw new ProvisionError('NO_PLAN', 'No hay planes activos configurados', 500);

  const now = new Date();
  // Las demos usan un trial corto explícito; el alta normal resuelve la promo.
  const trialDays = Number.isFinite(trialDaysOverride) && trialDaysOverride > 0
    ? Math.floor(trialDaysOverride)
    : await resolveTrialDays(prisma, plan);
  const trialEndsAt = new Date(now);
  trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
  const passwordHash = await bcrypt.hash(password, 12);

  const created = await prisma.$transaction(async (tx) => {
    // 1. Tenant
    const t = await tx.tenant.create({
      data: {
        name: restaurantName,
        slug,
        ownerEmail: emailLower,
        onboardingStep: 0,
        onboardingDone: false,
        ...(businessType ? { businessType } : {}),
        ...(enableWebStore ? { hasWebStore: true } : {}),
        ...(isDemo ? { isDemo: true, demoExpiresAt: trialEndsAt } : {}),
      },
    });

    // 2. Subscription (TRIAL) ligada al Tenant
    await tx.subscription.create({
      data: {
        tenantId:           t.id,
        planId:             plan.id,
        status:             'TRIAL',
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd:   trialEndsAt,
        priceSnapshot:      plan.price,
        paymentGateway:     'MANUAL',
      },
    });

    // 3. Restaurant + config default
    const r = await tx.restaurant.create({
      data: {
        tenantId: t.id,
        slug,
        name:     restaurantName,
        isActive: true,
        config: {
          create: {
            estimatedDelivery: 40,
            isOpen:            true,
            pointsPerTen:      1,
            pointsValuePesos:  0.10,
          },
        },
      },
    });

    // 3.5. Location default "Principal" (sin ella el TPV/onboarding se bloquean)
    const loc = await tx.location.create({
      data: {
        restaurantId: r.id,
        name:         'Principal',
        slug:         'principal',
        isActive:     true,
        ticketConfig: { create: { businessName: restaurantName, header: restaurantName } },
      },
    });

    // 3.6. Categorías de gasto operativo default
    await tx.operatingExpenseCategory.createMany({
      data: DEFAULT_EXPENSE_CATEGORIES.map((c) => ({ ...c, restaurantId: r.id })),
      skipDuplicates: true,
    });

    // 4. User ADMIN
    const u = await tx.user.create({
      data: {
        tenantId:     t.id,
        restaurantId: r.id,
        name:         ownerName,
        email:        emailLower,
        passwordHash,
        role:         'ADMIN',
        isActive:     true,
      },
    });

    // 5. Employee ADMIN default para el TPV (PIN 1234)
    const defaultPin = '1234';
    const pinHash = await bcrypt.hash(defaultPin, 10);
    const offlinePin = crypto.createHash('sha256').update(defaultPin).digest('hex');
    await tx.employee.create({
      data: {
        locationId: loc.id,
        name:       ownerName,
        pin:        pinHash,
        offlinePin,
        role:       'ADMIN',
        isActive:   true,
        canCharge: true, canDiscount: true, canModifyTickets: true, canDeleteTickets: true,
        canConfigSystem: true, canTakeDelivery: true, canTakeTakeout: true, canManageShifts: true,
        canCancelItems: true, canApplyDiscounts: true, canReopenTables: true, canManageUsers: true,
      },
    });

    return { tenant: t, restaurant: r, user: u, location: loc };
  });

  return { ...created, plan, trialDays, trialEndsAt };
}

/**
 * Siembra un menú de ejemplo (categorías + platillos) en un restaurante ya
 * creado. `categories` = [{ name, sortOrder?, items: [{ name, price, description? }] }].
 * Los platillos quedan disponibles en TPV y tienda online (availableOnline).
 * @returns {Promise<{categories:number, items:number}>}
 */
async function seedSampleMenu(restaurantId, categories) {
  if (!restaurantId) throw new ProvisionError('MISSING_RESTAURANT', 'restaurantId requerido');
  if (!Array.isArray(categories) || categories.length === 0)
    throw new ProvisionError('MISSING_CATEGORIES', 'categories debe ser un arreglo no vacío');

  const counters = { categories: 0, items: 0 };
  await prisma.$transaction(async (tx) => {
    let sort = 0;
    for (const cat of categories) {
      if (!cat || !cat.name) continue;
      const c = await tx.category.create({
        data: {
          restaurantId,
          name: String(cat.name),
          sortOrder: Number.isFinite(cat.sortOrder) ? cat.sortOrder : sort++,
          isActive: true,
        },
      });
      counters.categories++;
      const items = Array.isArray(cat.items) ? cat.items : [];
      for (const it of items) {
        if (!it || !it.name || it.price == null || Number.isNaN(Number(it.price))) continue;
        await tx.menuItem.create({
          data: {
            restaurantId,
            categoryId:  c.id,
            name:        String(it.name),
            description: it.description ? String(it.description) : null,
            price:       Number(it.price),
            isAvailable: true,
            availableOnline: true,
          },
        });
        counters.items++;
      }
    }
  });
  return counters;
}

/**
 * Convierte la salida de `scanMenuFromImages` (IA de visión) al formato que
 * consume `seedSampleMenu`: [{ name, sortOrder, items: [{ name, price, description }] }].
 *
 * El scan devuelve { categories: [nombres], items: [{ name, category, description,
 * base_options: [{ name, price }], ... }], global_modifiers }. Para la demo
 * aplanamos:
 *   · base_options con >1 opción → un platillo por opción ("Hamburguesa 150GR").
 *   · base_options con 1 opción → ese precio.
 *   · sin base_options → item.price (o 0).
 * Los modificadores globales no se siembran (la demo enseña el catálogo base).
 *
 * @param {object} scan  salida cruda de scanMenuFromImages
 * @returns {Array<{name:string, sortOrder:number, items:Array<{name:string,price:number,description:string}>}>}
 */
function mapScannedMenuToSeed(scan) {
  const categories = Array.isArray(scan?.categories) ? scan.categories : [];
  const items = Array.isArray(scan?.items) ? scan.items : [];

  const UNCAT = 'General';
  const byCat = new Map();
  categories.forEach((name, i) => {
    const key = String(name || '').trim();
    if (key) byCat.set(key, { name: key, sortOrder: i, items: [] });
  });

  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  for (const it of items) {
    if (!it || !it.name) continue;

    let bucket = null;
    const catKey = it.category ? String(it.category).trim() : '';
    if (catKey && byCat.has(catKey)) {
      bucket = byCat.get(catKey);
    } else {
      if (!byCat.has(UNCAT)) byCat.set(UNCAT, { name: UNCAT, sortOrder: byCat.size, items: [] });
      bucket = byCat.get(UNCAT);
    }

    const description = it.description ? String(it.description) : '';
    const opts = Array.isArray(it.base_options)
      ? it.base_options.filter((o) => o && toNum(o.price) != null)
      : [];

    if (opts.length > 1) {
      for (const o of opts) {
        const label = o.name ? `${it.name} ${o.name}`.trim() : String(it.name);
        bucket.items.push({ name: label, price: toNum(o.price) ?? 0, description });
      }
    } else {
      const price = opts.length === 1 ? toNum(opts[0].price) : toNum(it.price);
      bucket.items.push({ name: String(it.name), price: price ?? 0, description });
    }
  }

  return Array.from(byCat.values()).filter((c) => c.items.length > 0);
}

module.exports = { provisionTenant, seedSampleMenu, mapScannedMenuToSeed, slugify, ProvisionError };
