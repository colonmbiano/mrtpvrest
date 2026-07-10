'use strict';

// Superficie API para el BOT DE VENTAS del SaaS (Claude de cerebro vía MCP).
// Cierra el ciclo: Claude califica por WhatsApp y aquí da de alta la cuenta,
// siembra el menú de ejemplo y activa la promo (6 meses / primeros 100).
//
// Auth: token de PLATAFORMA (no por-tenant) en env SALES_BOT_TOKEN. Estas
// operaciones crean tenants nuevos, así que NO van scopeadas a un restaurante.
// Se monta ANTES de tenantMiddleware (como /api/bot). Falla cerrado si el token
// no está configurado.

const express = require('express');
const crypto = require('crypto');
const { prisma, runWithBypass } = require('@mrtpvrest/database');
const { provisionTenant, seedSampleMenu, ProvisionError } = require('../lib/tenant-provision');
const {
  PROMO_PLAN_NAME,
  FOUNDERS_LIMIT,
  FOUNDERS_TRIAL_DAYS,
  REGULAR_TRIAL_DAYS,
} = require('../lib/promo');
const log = require('../lib/logger')('sales-bot');

const router = express.Router();

const STOREFRONT_BASE = process.env.STOREFRONT_BASE || 'mrtpvrest.com';
const DEMO_STORE_URL =
  process.env.SALES_DEMO_STORE_URL || 'https://master-burguer-s.mrtpvrest.com';

const storeUrlFor = (slug) => `https://${slug}.${STOREFRONT_BASE}`;

// ── Auth de plataforma ──────────────────────────────────────────────────────
function salesAuth(req, res, next) {
  const expected = process.env.SALES_BOT_TOKEN;
  if (!expected) {
    return res.status(503).json({
      error: 'Bot de ventas no configurado (falta SALES_BOT_TOKEN en el backend).',
      code: 'NOT_CONFIGURED',
    });
  }
  const hdr = String(req.headers['authorization'] || '');
  const raw = hdr.startsWith('Bearer ')
    ? hdr.slice(7).trim()
    : String(req.headers['x-sales-token'] || '').trim();
  const a = Buffer.from(raw);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Token de ventas inválido', code: 'UNAUTHORIZED' });
  }
  next();
}

router.use(salesAuth);

// Genera una contraseña temporal legible (≥12 chars, cumple el mínimo de 8).
function genTempPassword() {
  return crypto.randomBytes(9).toString('base64url'); // ~12 chars url-safe
}

// ── GET /api/sales-bot/founders-status ──────────────────────────────────────
// Lugares de fundador restantes y días de trial vigentes (para dar urgencia).
router.get('/founders-status', async (_req, res) => {
  try {
    const plan = await prisma.plan.findFirst({ where: { name: PROMO_PLAN_NAME } });
    if (!plan) {
      return res.json({ promoActive: false, foundersLeft: 0, trialDays: REGULAR_TRIAL_DAYS });
    }
    const taken = await prisma.subscription.count({ where: { planId: plan.id } });
    const foundersLeft = Math.max(0, FOUNDERS_LIMIT - taken);
    res.json({
      promoActive: true,
      planName: plan.name,
      foundersLimit: FOUNDERS_LIMIT,
      foundersLeft,
      trialDays: foundersLeft > 0 ? FOUNDERS_TRIAL_DAYS : REGULAR_TRIAL_DAYS,
    });
  } catch (e) {
    log.error('founders_status.failed', { err: e });
    res.status(500).json({ error: 'Error al consultar la promo' });
  }
});

// ── GET /api/sales-bot/demo-link ────────────────────────────────────────────
// Link de tienda demo para mostrar el flujo de pedido en vivo.
router.get('/demo-link', (_req, res) => {
  res.json({ url: DEMO_STORE_URL });
});

// ── POST /api/sales-bot/provision-tenant ────────────────────────────────────
// Crea la cuenta completa (tenant + trial + restaurant + location + user +
// employee). Si no mandas password, genera una temporal y la devuelve para que
// se la pases al dueño por WhatsApp.
router.post('/provision-tenant', async (req, res) => {
  const {
    restaurantName,
    ownerName,
    email,
    password,
    requestedPlanId,
    enableWebStore = true, // el pitch del bot es "Tienda Online con Bot" → ON
  } = req.body || {};

  if (!restaurantName || !ownerName || !email) {
    return res.status(400).json({ error: 'restaurantName, ownerName y email son requeridos' });
  }

  const tempPassword = password ? null : genTempPassword();
  try {
    const result = await provisionTenant({
      restaurantName,
      ownerName,
      email,
      password: password || tempPassword,
      requestedPlanId,
      enableWebStore: !!enableWebStore,
    });

    log.info('provision_tenant.ok', {
      tenantId: result.tenant.id,
      restaurantId: result.restaurant.id,
      slug: result.tenant.slug,
      planName: result.plan.name,
      trialDays: result.trialDays,
      via: 'sales-bot',
    });

    res.status(201).json({
      ok: true,
      tenant: { id: result.tenant.id, name: result.tenant.name, slug: result.tenant.slug },
      restaurant: { id: result.restaurant.id, slug: result.restaurant.slug },
      location: { id: result.location.id, name: result.location.name },
      user: { email: result.user.email, name: result.user.name },
      // Credenciales para entregar al dueño (la temporal solo se muestra aquí).
      credentials: {
        email: result.user.email,
        tempPassword, // null si el caller mandó su propia password
        adminUrl: 'https://admin.mrtpvrest.com',
        tpvPin: '1234',
      },
      storeUrl: storeUrlFor(result.tenant.slug),
      plan: { name: result.plan.name, displayName: result.plan.displayName },
      trial: { days: result.trialDays, endsAt: result.trialEndsAt },
    });
  } catch (e) {
    if (e instanceof ProvisionError) {
      return res.status(e.status || 400).json({ error: e.message, code: e.code });
    }
    if (e?.code === 'P2002') {
      return res.status(409).json({ error: 'El email o nombre ya está registrado', code: 'DUPLICATE' });
    }
    log.error('provision_tenant.failed', { err: e, email: req.body?.email });
    res.status(500).json({ error: 'Error al dar de alta la cuenta' });
  }
});

// ── POST /api/sales-bot/seed-menu ───────────────────────────────────────────
// Siembra el menú de ejemplo que Claude capturó en la charla.
// body: { restaurantId, categories: [{ name, items: [{ name, price, description? }] }] }
router.post('/seed-menu', async (req, res) => {
  const { restaurantId, categories } = req.body || {};
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId requerido' });
  try {
    const counters = await seedSampleMenu(restaurantId, categories);
    log.info('seed_menu.ok', { restaurantId, ...counters });
    res.json({ ok: true, ...counters });
  } catch (e) {
    if (e instanceof ProvisionError) {
      return res.status(e.status || 400).json({ error: e.message, code: e.code });
    }
    log.error('seed_menu.failed', { err: e, restaurantId });
    res.status(500).json({ error: 'Error al sembrar el menú' });
  }
});

// ── GET /api/sales-bot/tenant-status ────────────────────────────────────────
// Estado de un tenant ya creado (para la etapa de soporte/seguimiento).
// query: ?slug=... | ?id=...
router.get('/tenant-status', async (req, res) => {
  const { slug, id } = req.query;
  if (!slug && !id) return res.status(400).json({ error: 'Pasa ?slug o ?id' });
  try {
    const tenant = await runWithBypass(() =>
      prisma.tenant.findFirst({
        where: id ? { id: String(id) } : { slug: String(slug) },
        select: {
          id: true, name: true, slug: true, hasWebStore: true,
          emailVerifiedAt: true, onboardingDone: true,
          subscription: {
            select: { status: true, trialEndsAt: true, currentPeriodEnd: true },
          },
        },
      })
    );
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
    const sub = tenant.subscription || null;
    res.json({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      storeUrl: storeUrlFor(tenant.slug),
      hasWebStore: tenant.hasWebStore,
      emailVerified: !!tenant.emailVerifiedAt,
      onboardingDone: tenant.onboardingDone,
      subscription: sub,
    });
  } catch (e) {
    log.error('tenant_status.failed', { err: e });
    res.status(500).json({ error: 'Error al consultar el tenant' });
  }
});

module.exports = router;
