'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const context = new AsyncLocalStorage();
const CONFIG_ID = 'saas-config';
const AUDIT_MESSAGE = 'marketplace.settings.updated';
const SELECT = { marketplaceSettings: true, marketplaceSettingsVersion: true };
const KEYS = ['commissionBps', 'ordersEnabled', 'deliveryEnabled', 'maxDeliveryKm'];

class MarketplaceSettingsError extends Error {
  constructor(code, message, statusCode = 400) { super(message); this.code = code; this.statusCode = statusCode; }
}
function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !KEYS.includes(key))
    || !Number.isInteger(value.commissionBps) || value.commissionBps < 0 || value.commissionBps > 10000
    || typeof value.ordersEnabled !== 'boolean' || typeof value.deliveryEnabled !== 'boolean'
    || typeof value.maxDeliveryKm !== 'number' || !Number.isFinite(value.maxDeliveryKm)
    || value.maxDeliveryKm < 0.1 || value.maxDeliveryKm > 5) {
    throw new MarketplaceSettingsError('INVALID_SETTINGS', 'Revisa la comisión (0–100%) y el radio (0.1–5 km).');
  }
  return Object.fromEntries(KEYS.map(key => [key, value[key]]));
}
function defaults(env) {
  const raw = String(env.MARKETPLACE_COMMISSION_BPS || '');
  const commission = /^\d+$/.test(raw) ? Number(raw) : 0;
  return { commissionBps: commission <= 10000 ? commission : 0,
    ordersEnabled: env.MARKETPLACE_V1_ORDERS_ENABLED === 'true',
    deliveryEnabled: env.MARKETPLACE_V1_DELIVERY_ENABLED === 'true', maxDeliveryKm: 5 };
}
function fromRow(row, env) {
  return { settings: row?.marketplaceSettings ? validate(row.marketplaceSettings) : defaults(env),
    version: row?.marketplaceSettingsVersion || 0, persisted: !!row?.marketplaceSettings };
}
async function readSettings(prisma, env = process.env) {
  return fromRow(await prisma.globalConfig.findUnique({ where: { id: CONFIG_ID }, select: SELECT }), env);
}
function integrationStatus(env) {
  let accountsActive = false;
  try { accountsActive = require('./marketplace-identity-mount').resolveIdentityMount(env).mount; } catch { /* Not ready. */ }
  // Only readiness booleans are returned. Neither secrets nor environment values leave the server.
  return { email: !!env.RESEND_API_KEY, captcha: !!env.TURNSTILE_SECRET_KEY,
    push: !!env.VAPID_PUBLIC_KEY && !!env.VAPID_PRIVATE_KEY,
    buyerSigning: !!env.MARKETPLACE_BUYER_JWT_SECRET,
    accountsActive,
    pin: !!env.MARKETPLACE_PIN_SECRET && Buffer.byteLength(env.MARKETPLACE_PIN_SECRET) >= 32 };
}
async function getOwnerSettings(prisma, env = process.env) {
  const [current, history] = await Promise.all([
    readSettings(prisma, env),
    prisma.systemLog.findMany({ where: { message: AUDIT_MESSAGE }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10, select: { id: true, createdAt: true, metadata: true } }),
  ]);
  return { ...current, integrations: integrationStatus(env), history };
}
async function saveOwnerSettings(prisma, body, actorId, env = process.env) {
  if (!body || Object.keys(body).some(key => !['version', 'settings'].includes(key))
    || !Number.isSafeInteger(body.version) || body.version < 0 || typeof actorId !== 'string' || !actorId) {
    throw new MarketplaceSettingsError('INVALID_SETTINGS', 'Solicitud de configuración inválida.');
  }
  const settings = validate(body.settings);
  if (settings.ordersEnabled && !integrationStatus(env).pin) {
    throw new MarketplaceSettingsError('PIN_REQUIRED', 'Falta configurar la clave de seguridad de los pedidos.', 409);
  }
  await prisma.$transaction(async tx => {
    await tx.globalConfig.upsert({ where: { id: CONFIG_ID }, create: { id: CONFIG_ID }, update: {} });
    const before = await readSettings(tx, env);
    const result = await tx.globalConfig.updateMany({ where: { id: CONFIG_ID, marketplaceSettingsVersion: body.version },
      data: { marketplaceSettings: settings, marketplaceSettingsVersion: { increment: 1 } } });
    if (result.count !== 1) throw new MarketplaceSettingsError('SETTINGS_CHANGED', 'Otra sesión cambió la configuración. Actualiza antes de guardar.', 409);
    await tx.systemLog.create({ data: { level: 'INFO', message: AUDIT_MESSAGE,
      path: '/api/saas/marketplace/settings', method: 'PATCH',
      metadata: { actorId, version: body.version + 1, before: before.settings, after: settings } } });
  });
  return getOwnerSettings(prisma, env);
}
function runtimeEnv(env = process.env) {
  const current = context.getStore();
  if (!current?.persisted) return env;
  return { ...env,
    // Existing orders and tracking stay available when new orders are paused.
    MARKETPLACE_V1_ORDERS_ENABLED: 'true',
    MARKETPLACE_COMMISSION_BPS: String(current.settings.commissionBps),
    MARKETPLACE_V1_DELIVERY_ENABLED: String(current.settings.deliveryEnabled),
    MARKETPLACE_MAX_DELIVERY_KM: String(current.settings.maxDeliveryKm) };
}
function ordersAllowed() { return context.getStore()?.settings.ordersEnabled !== false; }
function settingsMiddleware(prisma) {
  return async (_req, res, next) => {
    try {
      const current = await readSettings(prisma || require('@mrtpvrest/database').prisma);
      return context.run(current, next);
    } catch {
      res.status(503).json({ error: 'Configuración del marketplace temporalmente no disponible', errorCode: 'SETTINGS_UNAVAILABLE' });
    }
  };
}

module.exports = { MarketplaceSettingsError, validate, defaults, readSettings, getOwnerSettings, saveOwnerSettings,
  integrationStatus, settingsMiddleware, runtimeEnv, ordersAllowed, context };
