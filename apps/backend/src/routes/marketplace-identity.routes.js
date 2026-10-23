'use strict';

// Registro Marketplace global: se monta solo con feature flag en staging.
// API y storefront deben compartir origen (cookies SameSite Strict). No usa
// el auth ni los clientes por tienda existentes.
const rateLimit = require('express-rate-limit');
const { createMarketplaceIdentityService, IdentityError, SESSION_MS } = require('../lib/marketplace-identity');

const cookieName = isolated => isolated ? 'mrtpv_market_staging' : '__Host-mrtpv_market';
const noStore = (_, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
const limit = (max, windowMs) => rateLimit({ windowMs, max,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta más tarde.', code: 'RATE_LIMIT' },
});
const signupLimit = limit(5, 60 * 60 * 1000);
const authLimit = limit(15, 15 * 60 * 1000);
const mailLimit = limit(3, 60 * 60 * 1000);

function createMarketplaceIdentityRouter({
  Router, prisma, sendEmail, origin, isolated = false, captchaCheck, now,
  authenticateAdmin,
} = {}) {
  const expressRouter = (Router || require('express').Router)();
  const appOrigin = origin || process.env.MARKETPLACE_IDENTITY_ORIGIN;
  const service = createMarketplaceIdentityService({
    prisma: prisma || require('@mrtpvrest/database').prisma,
    sendEmail: sendEmail || require('../utils/mailer').sendEmail,
    publicOrigin: appOrigin, now,
  });
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
  const guarded = fn => async (req, res) => {
    try { return await fn(req, res); } catch (e) { return sendError(res, e); }
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
    if (req.method !== 'GET' && req.method !== 'HEAD') return verifyOrigin(req, res, next);
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
  expressRouter.post('/applications', authLimit, auth, guarded(async (req, res) => {
    res.status(201).json(await service.applyAs(req.marketplaceIdentity.account.id, req.body));
  }));
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
