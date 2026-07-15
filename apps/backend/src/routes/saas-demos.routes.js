'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// PANEL SaaS · CREACIÓN DE DEMOS (SUPER_ADMIN)
//
// Objetivo: dar de alta, desde el panel (y desde el celular), una cuenta DEMO
// 100% funcional y personalizada para enseñársela a un prospecto: con SU menú
// (extraído por IA de una foto del menú físico) y SU banner del negocio. La
// cuenta es un tenant real (login + TPV + tienda online) marcado `isDemo`, con
// trial corto, para poder filtrarla fuera de las métricas y purgarla al vencer.
//
// Reutiliza la maquinaria existente:
//   · provisionTenant()      → Tenant+Subscription(TRIAL)+Restaurant+Location+
//                              User(ADMIN)+Employee(PIN 1234). MISMO alta que el
//                              registro self-serve (ver lib/tenant-provision.js).
//   · scanMenuFromImages()   → Gemini Vision extrae categorías/platillos/precios.
//   · seedSampleMenu()       → siembra el menú en el restaurante.
//   · uploadImage()          → Cloudinary (banner 16:9, logo cuadrado).
//
// Todas las rutas exigen SUPER_ADMIN. Se montan en /api/saas/demos ANTES del
// router general /api/saas (ver index.js) para que esa ruta tenga precedencia.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const crypto  = require('crypto');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireSuperAdmin } = require('../middleware/auth.middleware');
const { upload, uploadImage } = require('../services/cloudinary.service');
const { scanMenuFromImages }  = require('../services/ai.service');
const { resolveGeminiKey }    = require('../services/ai-key.service');
const {
  provisionTenant,
  seedSampleMenu,
  mapScannedMenuToSeed,
  ProvisionError,
} = require('../lib/tenant-provision');
const log = require('../lib/logger')('saas-demos');

const router = express.Router();

// Mismos helpers de URL que el sales-bot (fuente única de convención de dominios).
const STOREFRONT_BASE = process.env.STOREFRONT_BASE || 'mrtpvrest.com';
const ADMIN_URL       = process.env.SAAS_ADMIN_URL || 'https://admin.mrtpvrest.com';
const storeUrlFor     = (slug) => `https://${slug}.${STOREFRONT_BASE}`;

function genTempPassword() {
  return crypto.randomBytes(9).toString('base64url'); // ~12 chars url-safe
}

// Todas las rutas de demos son exclusivas del SUPER_ADMIN.
router.use(authenticate, requireSuperAdmin);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/saas/demos/scan-menu
// Multipart field: images (jpeg/png/webp, hasta 8). Devuelve el menú YA
// convertido al formato editable de siembra para que el operador lo revise
// antes de crear la demo. NO crea nada todavía.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/scan-menu', upload.array('images', 8), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Sube al menos una foto del menú (campo "images").' });
    }

    const { apiKey } = resolveGeminiKey();
    const imageParts = req.files.map((file) => ({
      data: file.buffer.toString('base64'),
      mimeType: file.mimetype,
    }));

    const scan = await scanMenuFromImages(imageParts, apiKey);
    const menu = mapScannedMenuToSeed(scan);

    const items = menu.reduce((n, c) => n + c.items.length, 0);
    log.info('demo.scan_menu.ok', { images: req.files.length, categories: menu.length, items });

    res.json({ menu, categories: menu.length, items });
  } catch (e) {
    if (e?.code === 'AI_KEY_REQUIRED') {
      return res.status(503).json({ error: e.message, code: 'AI_KEY_REQUIRED' });
    }
    log.error('demo.scan_menu.failed', { err: e });
    res.status(500).json({ error: 'No se pudo analizar el menú con IA. Intenta con fotos más nítidas.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/saas/demos
// Crea la demo completa. Acepta multipart con:
//   · payload (text)  → JSON: { businessName, ownerName?, ownerEmail?, planId?,
//                              businessType?, demoDays?, enableWebStore?, menu? }
//     donde menu = [{ name, items: [{ name, price, description? }] }]
//   · banner (file, opcional) → se sube 16:9 y se crea un Banner activo en la
//                               location de la demo.
//   · logo   (file, opcional) → logo del negocio (restaurant + tenant).
//
// Devuelve credenciales (email + password temporal + PIN) y links listos para
// compartir por WhatsApp. La password solo se muestra aquí (no se persiste en
// claro).
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/',
  upload.fields([{ name: 'banner', maxCount: 1 }, { name: 'logo', maxCount: 1 }]),
  async (req, res) => {
    // El payload viaja como string JSON dentro del multipart.
    let body;
    try {
      body = req.body?.payload ? JSON.parse(req.body.payload) : (req.body || {});
    } catch {
      return res.status(400).json({ error: 'payload inválido (JSON malformado).' });
    }

    const {
      businessName,
      ownerName,
      ownerEmail,
      planId,
      businessType = null,
      demoDays = 7,
      enableWebStore = true,
      menu = [],
    } = body;

    if (!businessName || String(businessName).trim().length < 2) {
      return res.status(400).json({ error: 'businessName es requerido.' });
    }

    // Email autogenerado si no se da uno (demos suelen no tener dueño real aún).
    const rnd = crypto.randomBytes(3).toString('hex');
    const email = (ownerEmail && String(ownerEmail).trim())
      || `demo-${rnd}@demo.${STOREFRONT_BASE}`;
    const tempPassword = genTempPassword();
    const trialDays = Number.isFinite(Number(demoDays)) ? Math.max(1, Math.min(90, Number(demoDays))) : 7;

    try {
      // 1. Alta del tenant completo, marcado como DEMO con trial corto.
      const result = await provisionTenant({
        restaurantName: String(businessName).trim(),
        ownerName: (ownerName && String(ownerName).trim()) || String(businessName).trim(),
        email,
        password: tempPassword,
        requestedPlanId: planId || undefined,
        enableWebStore: !!enableWebStore,
        isDemo: true,
        businessType,
        trialDaysOverride: trialDays,
      });

      const { tenant, restaurant, location } = result;

      // 2. Menú del cliente (si vino). Errores aquí NO tumban la demo: la cuenta
      //    ya existe; devolvemos el conteo real sembrado.
      let seeded = { categories: 0, items: 0 };
      if (Array.isArray(menu) && menu.length > 0) {
        try {
          seeded = await seedSampleMenu(restaurant.id, menu);
        } catch (e) {
          log.error('demo.seed_menu.failed', { err: e, tenantId: tenant.id });
        }
      }

      // 3. Banner del negocio (opcional) → Cloudinary 16:9 + Banner activo.
      let bannerUrl = null;
      const bannerFile = req.files?.banner?.[0];
      if (bannerFile) {
        try {
          bannerUrl = await uploadImage(bannerFile.buffer, `demos/${tenant.slug}`, 'banner');
          await prisma.banner.create({
            data: {
              locationId: location.id,
              title: String(businessName).trim(),
              imageUrl: bannerUrl,
              isActive: true,
              sortOrder: 0,
            },
          });
        } catch (e) {
          log.error('demo.banner.failed', { err: e, tenantId: tenant.id });
        }
      }

      // 4. Logo del negocio (opcional) → restaurant.logoUrl + tenant.logoUrl.
      let logoUrl = null;
      const logoFile = req.files?.logo?.[0];
      if (logoFile) {
        try {
          logoUrl = await uploadImage(logoFile.buffer, `demos/${tenant.slug}`, 'default');
          await prisma.$transaction([
            prisma.restaurant.update({ where: { id: restaurant.id }, data: { logoUrl } }),
            prisma.tenant.update({ where: { id: tenant.id }, data: { logoUrl } }),
          ]);
        } catch (e) {
          log.error('demo.logo.failed', { err: e, tenantId: tenant.id });
        }
      }

      log.info('demo.create.ok', {
        tenantId: tenant.id,
        slug: tenant.slug,
        trialDays,
        seededItems: seeded.items,
        hasBanner: !!bannerUrl,
        hasLogo: !!logoUrl,
      });

      res.status(201).json({
        ok: true,
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        restaurant: { id: restaurant.id, slug: restaurant.slug },
        menu: seeded,
        bannerUrl,
        logoUrl,
        credentials: {
          email: result.user.email,
          password: tempPassword, // solo se muestra aquí
          tpvPin: '1234',
          adminUrl: ADMIN_URL,
        },
        storeUrl: storeUrlFor(tenant.slug),
        plan: { name: result.plan.name, displayName: result.plan.displayName },
        trial: { days: result.trialDays, endsAt: result.trialEndsAt },
      });
    } catch (e) {
      if (e instanceof ProvisionError) {
        return res.status(e.status || 400).json({ error: e.message, code: e.code });
      }
      if (e?.code === 'P2002') {
        return res.status(409).json({ error: 'Ese nombre o email ya está registrado.', code: 'DUPLICATE' });
      }
      log.error('demo.create.failed', { err: e });
      res.status(500).json({ error: 'No se pudo crear la demo.' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/saas/demos — lista las cuentas DEMO (para gestionarlas/compartirlas)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (_req, res) => {
  try {
    const demos = await prisma.tenant.findMany({
      where: { isDemo: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, slug: true, ownerEmail: true, logoUrl: true,
        demoExpiresAt: true, createdAt: true,
        subscription: { select: { status: true, trialEndsAt: true } },
        restaurants: { select: { id: true, slug: true }, take: 1 },
        _count: { select: { restaurants: true } },
      },
    });

    const now = Date.now();
    const result = demos.map((d) => ({
      ...d,
      storeUrl: storeUrlFor(d.slug),
      daysLeft: d.demoExpiresAt
        ? Math.ceil((new Date(d.demoExpiresAt).getTime() - now) / (1000 * 60 * 60 * 24))
        : null,
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
