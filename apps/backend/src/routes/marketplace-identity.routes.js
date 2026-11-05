'use strict';

// Registro Marketplace global: se monta solo con feature flag (ver
// lib/marketplace-identity-mount.js). La tienda y la API deben ser del mismo
// sitio (cookies SameSite Strict). No usa el auth ni los clientes por tienda.
const rateLimit = require('express-rate-limit');
const { createMarketplaceIdentityService, IdentityError, SESSION_MS } = require('../lib/marketplace-identity');

// Token de comprador para las APIs v1 (direcciones, cotización, orden,
// seguimiento). Corto: el cliente lo vuelve a pedir con su sesión.
const BUYER_TOKEN_TTL_S = 15 * 60;

const cookieName = isolated => isolated ? 'mrtpv_market_staging' : '__Host-mrtpv_market';
const noStore = (_, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
const limit = (max, windowMs) => rateLimit({ windowMs, max,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta más tarde.', code: 'RATE_LIMIT' },
});
const signupLimit = limit(5, 60 * 60 * 1000);
const authLimit = limit(15, 15 * 60 * 1000);
const mailLimit = limit(3, 60 * 60 * 1000);
// Se renueva cada pocos minutos por pestaña: más holgado que el login.
const tokenLimit = limit(60, 15 * 60 * 1000);

// `roles`: perfiles que se pueden registrar o solicitar (null = todos, staging).
// `signBuyerToken(claims, { expiresIn })`: inyectable en pruebas.
function createMarketplaceIdentityRouter({
  Router, prisma, sendEmail, origin, isolated = false, captchaCheck, now,
  authenticateAdmin, roles = null, signBuyerToken, signCourierToken,
} = {}) {
  const expressRouter = (Router || require('express').Router)();
  const appOrigin = origin || process.env.MARKETPLACE_IDENTITY_ORIGIN;
  const service = createMarketplaceIdentityService({
    prisma: prisma || require('@mrtpvrest/database').prisma,
    sendEmail: sendEmail || require('../utils/mailer').sendEmail,
    publicOrigin: appOrigin, now, roles,
  });
  const signToken = signBuyerToken
    || ((claims, opts) => require('../lib/marketplace-jwt').signMarketplaceToken('buyer', claims, opts));
  const signCourier = signCourierToken
    || ((claims, opts) => require('../lib/marketplace-jwt').signMarketplaceToken('courier', claims, opts));
  const { COURIER_TOKEN_TTL_S } = require('../lib/marketplace-courier-identity');
  const canApply = !roles || roles.includes('MERCHANT') || roles.includes('COURIER');
  const canCourier = !roles || roles.includes('COURIER');
  const verifyCaptcha = captchaCheck || ((token, ip) => require('../lib/turnstile').verifyTurnstile(token, ip));
  const name = cookieName(isolated);
  const cookies = { httpOnly: true, sameSite: 'strict', secure: !isolated, path: '/' };

  const sendError = (res, e) => {
    if (e instanceof IdentityError) {
      return res.status(e.status).json({ error: e.code, code: e.code });
    }
    // Do not log plaintext passwords, tokens, email addresses or user payloads.
    return res.status(503).json({ error: 'Servicio de registro temporalmente no disponible', code: 'IDENTITY_UNAVAILABLE' });
  };
  const guarded = fn => async (req, res, next) => {
    try { return await fn(req, res, next); } catch (e) { return sendError(res, e); }
  };
  const verifyOrigin = (req, res, next) => {
    // Fail closed: no Origin header is accepted for browser account mutations.
    if (req.headers.origin !== appOrigin) return res.status(403).json({ error: 'ORIGIN_FORBIDDEN' });
    next();
  };
  const requireCaptcha = guarded(async (req, res, next) => {
    const result = await verifyCaptcha(req.body?.turnstileToken, req.ip);
    if (!result?.ok || result.skipped) return res.status(403).json({ error: 'CAPTCHA_REQUIRED' });
    return next();
  });
  const readToken = req => {
    const header = typeof req.headers.cookie === 'string' ? req.headers.cookie : '';
    const raw = header.split(';').map(v => v.trim()).find(v => v.startsWith(name + '='));
    const token = raw ? raw.slice(name.length + 1) : '';
    return /^[a-f0-9]{64}$/.test(token) ? token : '';
  };
  const auth = guarded(async (req, res, next) => {
    req.marketplaceIdentity = await service.currentSession(readToken(req));
    next();
  });

  expressRouter.use(noStore);
  expressRouter.use((req, res, next) => {
    // App URLs must not be embedded in token/HTML by a request.
    res.set('Referrer-Policy', 'no-referrer');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // El token de courier es para apps nativas (APK): se protege con credenciales,
      // rate limit y clave dedicada, no con la cookie same-site, así que no exige Origin.
      if (req.path.endsWith('/courier/token')) return next();
      return verifyOrigin(req, res, next);
    }
    next();
  });

  expressRouter.post('/register', signupLimit, requireCaptcha, guarded(async (req, res) => {
    await service.register(req.body);
    res.status(202).json({ message: 'Si la solicitud es válida, recibirás instrucciones por correo.' });
  }));
  expressRouter.post('/verify-email', authLimit, guarded(async (req, res) => {
    await service.verifyEmail(req.body?.token);
    res.json({ verified: true });
  }));
  expressRouter.post('/resend-verification', mailLimit, requireCaptcha, guarded(async (req, res) => {
    await service.resendVerification(req.body?.email);
    res.status(202).json({ message: 'Si la cuenta existe, recibirá instrucciones.' });
  }));
  expressRouter.post('/login', authLimit, guarded(async (req, res) => {
    const { token, account } = await service.login(req.body);
    res.cookie(name, token, { ...cookies, maxAge: SESSION_MS });
    res.json({ account });
  }));
  expressRouter.get('/me', auth, guarded(async (req, res) => {
    res.json({ account: req.marketplaceIdentity.account });
  }));
  // Emisor del token de comprador (G8): cambia la sesión por cookie por un JWT
  // corto con clave, emisor y destinatario propios del marketplace. Es POST: pasa
  // por la comprobación de Origin, y la cookie Strict no viaja desde otro sitio.
  expressRouter.post('/token', tokenLimit, auth, guarded(async (req, res) => {
    const { account } = req.marketplaceIdentity;
    const buyer = account.profiles.some(p => p.role === 'BUYER' && p.status === 'APPROVED');
    if (!buyer) throw new IdentityError('BUYER_PROFILE_REQUIRED', 403);
    const token = signToken({ accountId: account.id, role: 'BUYER' }, { expiresIn: BUYER_TOKEN_TTL_S });
    res.json({ token, tokenType: 'Bearer', expiresIn: BUYER_TOKEN_TTL_S });
  }));
  expressRouter.post('/logout', guarded(async (req, res) => {
    await service.logout(readToken(req));
    res.clearCookie(name, cookies);
    res.json({ success: true });
  }));
  expressRouter.post('/password/forgot', mailLimit, requireCaptcha, guarded(async (req, res) => {
    await service.forgotPassword(req.body?.email);
    res.status(202).json({ message: 'Si la cuenta existe, recibirá instrucciones.' });
  }));
  expressRouter.post('/password/reset', authLimit, guarded(async (req, res) => {
    await service.resetPassword(req.body?.token, req.body?.password);
    res.clearCookie(name, cookies);
    res.json({ success: true });
  }));
  // Token Bearer de repartidor (password grant) para el APK, que no puede usar la
  // cookie same-site. Protegido por credenciales + rate limit + clave dedicada;
  // exige un perfil COURIER aprobado. La verificación de despacho (NetworkCourier
  // ACTIVE/VERIFIED) la aplican las rutas de dispatch/couriers.
  if (canCourier) {
    expressRouter.post('/courier/token', authLimit, guarded(async (req, res) => {
      const { accountId } = await service.authenticateCourier(req.body);
      const token = signCourier({ accountId, role: 'COURIER' }, { expiresIn: COURIER_TOKEN_TTL_S });
      res.json({ token, tokenType: 'Bearer', expiresIn: COURIER_TOKEN_TTL_S });
    }));
  }
  // En producción solo hay compradores: las solicitudes de negocio o repartidor no existen.
  if (canApply) {
    expressRouter.post('/applications', authLimit, auth, guarded(async (req, res) => {
      res.status(201).json(await service.applyAs(req.marketplaceIdentity.account.id, req.body));
    }));
  }
  // Admin: reuse the existing SaaS superadmin authentication, not buyer cookies.
  const adminGuard = authenticateAdmin || ((req, res, next) => {
    const { authenticate, requireSuperAdmin } = require('../middleware/auth.middleware');
    return authenticate(req, res, () => requireSuperAdmin(req, res, next));
  });
  expressRouter.get('/admin/applications', adminGuard, guarded(async (req, res) => {
    res.json(await service.listApplications(req.query.status));
  }));
  expressRouter.post('/admin/applications/:id/decision', authLimit, adminGuard, guarded(async (req, res) => {
    if (!req.user?.id) throw new IdentityError('FORBIDDEN', 403);
    res.json(await service.reviewApplication(req.params.id, req.user.id, req.body?.decision));
  }));

  return expressRouter;
}

module.exports = { createMarketplaceIdentityRouter, cookieName };
