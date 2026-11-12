'use strict';

// Marketplace identity service. Off by default; in production only buyer accounts.
// No Tenant/User/Customer/Employee records are created here. Session tokens are
// never returned through public JSON: callers send them only as HttpOnly cookies.
// The router's /token endpoint issues short-lived buyer JWTs, never the session.
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BUSINESS_TYPES = new Set(['RESTAURANT','GROCERY','RETAIL','HARDWARE','AUTOPARTS']);
const DELIVERY_MODES = new Set(['OWN','SHARED','BOTH']);
const VEHICLES = new Set(['MOTO','BICYCLE','CAR','WALK']);
const ROLES = new Set(['BUYER','MERCHANT','COURIER']);
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const VERIFY_MS = 24 * 60 * 60 * 1000;
const RESET_MS = 30 * 60 * 1000;

class IdentityError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const hashToken = raw => crypto.createHash('sha256').update(raw).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('hex');
const trimmed = (v, max) => typeof v === 'string' ? v.trim().replace(/\s+/g,' ').slice(0, max + 1) : '';
const email = v => typeof v === 'string' ? v.trim().toLowerCase() : '';
const phone = v => typeof v === 'string' ? v.replace(/[\s()-]/g, '') : '';
const validToken = token => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
const publicAccount = a => ({
  id: a.id, name: a.fullName, email: a.email, emailVerified: Boolean(a.emailVerifiedAt),
  profiles: (a.applications || []).map(p => ({ role: p.role, status: p.status })),
});

// `allowedRoles`: en producción solo BUYER (ver marketplace-identity-mount).
function validateSignup(input, allowedRoles = ROLES) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new IdentityError('INVALID_SIGNUP');
  const role = input.role;
  const fullName = trimmed(input.fullName, 120);
  const normalizedEmail = email(input.email);
  const normalizedPhone = phone(input.phone);
  const city = trimmed(input.city, 120);
  const password = input.password;
  if (!ROLES.has(role) || !allowedRoles.has(role) || fullName.length < 2 || fullName.length > 120
      || normalizedEmail.length > 254 || !EMAIL.test(normalizedEmail)
      || !/^(?:\+52)?[0-9]{10}$/.test(normalizedPhone)
      || city.length < 2 || city.length > 120
      || typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new IdentityError('INVALID_SIGNUP');
  }
  const application = { role, status: 'PENDING_EMAIL' };
  if (role === 'MERCHANT') {
    const businessName = trimmed(input.businessName, 120);
    if (businessName.length < 2 || businessName.length > 120
      || !BUSINESS_TYPES.has(input.businessType) || !DELIVERY_MODES.has(input.deliveryMode)) {
      throw new IdentityError('INVALID_SIGNUP');
    }
    Object.assign(application, { businessName, businessType: input.businessType, deliveryMode: input.deliveryMode });
  }
  if (role === 'COURIER') {
    if (!VEHICLES.has(input.vehicle) || !DELIVERY_MODES.has(input.network)) throw new IdentityError('INVALID_SIGNUP');
    Object.assign(application, { vehicle: input.vehicle, network: input.network });
  }
  return { fullName, email: normalizedEmail, phone: normalizedPhone, city, password, application };
}

function createMarketplaceIdentityService({ prisma, sendEmail, publicOrigin, now = () => new Date(), roles = null, provisionCourier = null }) {
  if (!prisma || typeof sendEmail !== 'function') throw new Error('Marketplace identity dependencies required');
  const allowedRoles = roles ? new Set(roles) : ROLES;
  if (typeof publicOrigin !== 'string' || !/^https:\/\//.test(publicOrigin)) throw new Error('Marketplace identity requires HTTPS origin');
  const origin = new URL(publicOrigin);
  if (origin.origin !== publicOrigin || origin.username || origin.password || origin.pathname !== '/'
    || origin.search || origin.hash) throw new Error('Invalid Marketplace identity origin');

  async function emailToken(account, purpose, path) {
    const raw = newToken();
    await prisma.marketplaceAuthToken.create({
      data: { accountId: account.id, purpose, tokenHash: hashToken(raw),
        expiresAt: new Date(now().getTime() + (purpose === 'EMAIL_VERIFY' ? VERIFY_MS : RESET_MS)) },
    });
    // Fragment never reaches HTTP servers or server access logs.
    const link = publicOrigin + path + '#token=' + raw;
    const subject = purpose === 'EMAIL_VERIFY' ? 'Verifica tu correo en Mercadito Colorines' : 'Recupera tu acceso a Mercadito Colorines';
    // No HTML or URL values depend on user-controlled strings (only validated origin and random token).
    await sendEmail(account.email, subject,
      '<p>Solicitaste ' + (purpose === 'EMAIL_VERIFY' ? 'verificar tu correo' : 'restablecer tu contraseña') +
      ' en Mercadito Colorines.</p><p><a href="' + link + '">Continuar de forma segura</a></p>' +
      '<p>Si no lo solicitaste, ignora este correo.</p>');
  }

  async function register(input) {
    const data = validateSignup(input, allowedRoles);
    if (input.termsAccepted !== true) throw new IdentityError("TERMS_ACCEPTANCE_REQUIRED", 422);
    // Unverified duplicates are deliberately indistinguishable from new signups.
    if (await prisma.marketplaceAccount.findUnique({ where: { email: data.email }, select: { id: true } })) {
      return { accepted: true };
    }
    const passwordHash = await bcrypt.hash(data.password, 12);
    let created;
    try {
      created = await prisma.$transaction(async tx =>
        tx.marketplaceAccount.create({
          data: {
            email: data.email, fullName: data.fullName, phone: data.phone,
            city: data.city, passwordHash, termsAcceptedAt: now(), applications: { create: data.application },
          },
        })
      );
    } catch (e) {
      if (e.code === 'P2002') return { accepted: true }; // concurrent duplicate
      throw e;
    }
    await emailToken(created, 'EMAIL_VERIFY', '/registro/verificar');
    return { accepted: true };
  }

  async function resendVerification(inputEmail) {
    const address = email(inputEmail);
    if (!EMAIL.test(address) || address.length > 254) throw new IdentityError('INVALID_EMAIL');
    const account = await prisma.marketplaceAccount.findUnique({ where: { email: address } });
    if (account && !account.emailVerifiedAt && !account.disabledAt) {
      await emailToken(account, 'EMAIL_VERIFY', '/registro/verificar');
    }
    return { accepted: true };
  }

  async function verifyEmail(rawToken) {
    if (!validToken(rawToken)) throw new IdentityError('INVALID_TOKEN');
    const tokenHash = hashToken(rawToken);
    return prisma.$transaction(async tx => {
      const record = await tx.marketplaceAuthToken.findUnique({ where: { tokenHash } });
      if (!record || record.purpose !== 'EMAIL_VERIFY' || record.consumedAt || record.expiresAt <= now()) {
        throw new IdentityError('INVALID_TOKEN');
      }
      const used = await tx.marketplaceAuthToken.updateMany({
        where: { id: record.id, consumedAt: null, expiresAt: { gt: now() } },
        data: { consumedAt: now() },
      });
      if (used.count !== 1) throw new IdentityError('INVALID_TOKEN');
      const account = await tx.marketplaceAccount.update({
        where: { id: record.accountId }, data: { emailVerifiedAt: now() },
        select: { applications: { select: { role: true } } },
      });
      await tx.marketplaceApplication.updateMany({
        where: { accountId: record.accountId, role: 'BUYER', status: 'PENDING_EMAIL' },
        data: { status: 'APPROVED' },
      });
      await tx.marketplaceApplication.updateMany({
        where: { accountId: record.accountId, role: { in: ['MERCHANT','COURIER'] }, status: 'PENDING_EMAIL' },
        data: { status: 'PENDING_REVIEW' },
      });
      return { verified: true, roles: account.applications.map(application => application.role) };
    });
  }

  async function findStoreUser(address) {
    if (!prisma.user) return null;
    let u = typeof prisma.user.findUnique === 'function'
      ? await prisma.user.findUnique({ where: { email: address }, include: { tenant: true, restaurant: true } })
      : null;
    if (!u && typeof prisma.user.findFirst === 'function') {
      u = await prisma.user.findFirst({
        where: { email: { equals: address, mode: 'insensitive' } },
        include: { tenant: true, restaurant: true },
      });
    }
    if (!u || u.isActive === false || !['ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(u.role)) return null;
    if (u.role !== 'SUPER_ADMIN' && u.tenant && !u.tenant.emailVerifiedAt) return null;
    return u;
  }

  async function syncStoreAccount(address, storeUser, existingAccount) {
    const cleanPhone = phone(storeUser.phone || storeUser.tenant?.whatsappNumber || '').replace(/^\+52/, '');
    const validPhone = /^[0-9]{10}$/.test(cleanPhone) ? cleanPhone : '0000000000';
    const rawType = storeUser.restaurant?.businessType || storeUser.tenant?.businessType;
    const bType = BUSINESS_TYPES.has(rawType) ? rawType : 'RESTAURANT';
    const bName = trimmed(storeUser.restaurant?.name || storeUser.tenant?.name || storeUser.name || 'Mi Negocio', 120) || 'Mi Negocio';
    const verifiedAt = storeUser.tenant?.emailVerifiedAt || now();

    if (!existingAccount) {
      try {
        return await prisma.marketplaceAccount.create({
          data: {
            email: address,
            fullName: trimmed(storeUser.name || bName, 120) || 'Propietario',
            phone: validPhone,
            city: 'Local',
            passwordHash: storeUser.passwordHash,
            emailVerifiedAt: verifiedAt,
            applications: {
              create: [
                { role: 'BUYER', status: 'APPROVED' },
                { role: 'MERCHANT', status: 'APPROVED', businessName: bName, businessType: bType, deliveryMode: 'BOTH' },
              ],
            },
          },
          include: { applications: { select: { role: true, status: true } } },
        });
      } catch (e) {
        if (e.code !== 'P2002') throw e;
        existingAccount = await prisma.marketplaceAccount.findUnique({
          where: { email: address }, include: { applications: { select: { role: true, status: true } } },
        });
      }
    }

    if (!existingAccount) return null;
    await prisma.marketplaceAccount.update({
      where: { id: existingAccount.id },
      data: {
        passwordHash: storeUser.passwordHash,
        emailVerifiedAt: existingAccount.emailVerifiedAt || verifiedAt,
      },
    });
    const roles = new Set((existingAccount.applications || []).map(a => a.role));
    if (!roles.has('BUYER')) {
      await prisma.marketplaceApplication.create({
        data: { accountId: existingAccount.id, role: 'BUYER', status: 'APPROVED' },
      }).catch(() => {});
    }
    if (!roles.has('MERCHANT')) {
      await prisma.marketplaceApplication.create({
        data: { accountId: existingAccount.id, role: 'MERCHANT', status: 'APPROVED', businessName: bName, businessType: bType, deliveryMode: 'BOTH' },
      }).catch(() => {});
    }
    return prisma.marketplaceAccount.findUnique({
      where: { id: existingAccount.id }, include: { applications: { select: { role: true, status: true } } },
    });
  }

  async function login(input) {
    const address = email(input?.email);
    if (!EMAIL.test(address) || typeof input?.password !== 'string' || input.password.length > 128) {
      throw new IdentityError('INVALID_CREDENTIALS', 401);
    }
    let account = await prisma.marketplaceAccount.findUnique({
      where: { email: address }, include: { applications: { select: { role: true, status: true } } },
    });
    // Keep a comparable bcrypt work factor for non-existent accounts.
    const fallbackHash = '$2a$12$QpZXirB5mzV9gZjERmBUd.9NxTfXMq.o2Ti7suIzauq/td0BqCM9e';
    let valid = await bcrypt.compare(input.password, account?.passwordHash || fallbackHash);
    if ((!account || !valid || !account.emailVerifiedAt) && !account?.disabledAt) {
      const storeUser = await findStoreUser(address);
      if (storeUser && await bcrypt.compare(input.password, storeUser.passwordHash)) {
        account = await syncStoreAccount(address, storeUser, account);
        valid = Boolean(account);
      }
    }
    if (!account || !valid || !account.emailVerifiedAt || account.disabledAt) {
      throw new IdentityError('INVALID_CREDENTIALS', 401);
    }
    const raw = newToken();
    await prisma.marketplaceSession.create({ data: {
      accountId: account.id, tokenHash: hashToken(raw), expiresAt: new Date(now().getTime() + SESSION_MS),
    } });
    return { token: raw, account: publicAccount(account) };
  }

  // Password grant para apps nativas (APK): verifica credenciales y exige un
  // perfil COURIER APROBADO, sin crear sesion (el token Bearer de courier es
  // stateless; ver marketplace-courier-identity.js). La verificacion de despacho
  // (MarketplaceNetworkCourier ACTIVE/VERIFIED) la aplican las rutas que lo usan.
  async function authenticateCourier(input) {
    const address = email(input?.email);
    if (!EMAIL.test(address) || typeof input?.password !== 'string' || input.password.length > 128) {
      throw new IdentityError('INVALID_CREDENTIALS', 401);
    }
    const account = await prisma.marketplaceAccount.findUnique({
      where: { email: address }, include: { applications: { select: { role: true, status: true } } },
    });
    // Mismo factor de trabajo bcrypt para cuentas inexistentes (timing).
    const fallbackHash = '$2a$12$QpZXirB5mzV9gZjERmBUd.9NxTfXMq.o2Ti7suIzauq/td0BqCM9e';
    const valid = await bcrypt.compare(input.password, account?.passwordHash || fallbackHash);
    if (!account || !valid || !account.emailVerifiedAt || account.disabledAt) {
      throw new IdentityError('INVALID_CREDENTIALS', 401);
    }
    const courier = account.applications.some(a => a.role === 'COURIER' && a.status === 'APPROVED');
    if (!courier) throw new IdentityError('COURIER_PROFILE_REQUIRED', 403);
    if (!account.termsAcceptedAt) {
      if (input.termsAccepted !== true) throw new IdentityError('TERMS_ACCEPTANCE_REQUIRED', 422);
      await prisma.marketplaceAccount.updateMany({
        where: { id: account.id, termsAcceptedAt: null }, data: { termsAcceptedAt: now() },
      });
    }
    return { accountId: account.id };
  }

  async function currentSession(raw) {
    if (!validToken(raw)) throw new IdentityError('UNAUTHENTICATED', 401);
    const row = await prisma.marketplaceSession.findUnique({
      where: { tokenHash: hashToken(raw) },
      include: { account: { include: { applications: { select: { role: true, status: true } } } } },
    });
    if (!row || row.revokedAt || row.expiresAt <= now() || !row.account.emailVerifiedAt || row.account.disabledAt) {
      throw new IdentityError('UNAUTHENTICATED', 401);
    }
    return { account: publicAccount(row.account), rawSession: raw };
  }

  async function logout(raw) {
    if (validToken(raw)) await prisma.marketplaceSession.updateMany({
      where: { tokenHash: hashToken(raw), revokedAt: null }, data: { revokedAt: now() },
    });
    return { success: true };
  }

  async function forgotPassword(inputEmail) {
    const address = email(inputEmail);
    if (!EMAIL.test(address) || address.length > 254) throw new IdentityError('INVALID_EMAIL');
    const account = await prisma.marketplaceAccount.findUnique({ where: { email: address } });
    if (account && account.emailVerifiedAt && !account.disabledAt) {
      await emailToken(account, 'PASSWORD_RESET', '/registro/restablecer');
    }
    return { accepted: true };
  }

  async function resetPassword(rawToken, password) {
    if (!validToken(rawToken) || typeof password !== 'string' || password.length < 12 || password.length > 128) {
      throw new IdentityError('INVALID_TOKEN');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    return prisma.$transaction(async tx => {
      const tokenHash = hashToken(rawToken);
      const record = await tx.marketplaceAuthToken.findUnique({ where: { tokenHash } });
      if (!record || record.purpose !== 'PASSWORD_RESET' || record.consumedAt || record.expiresAt <= now()) {
        throw new IdentityError('INVALID_TOKEN');
      }
      const used = await tx.marketplaceAuthToken.updateMany({
        where: { id: record.id, consumedAt: null, expiresAt: { gt: now() } }, data: { consumedAt: now() },
      });
      if (used.count !== 1) throw new IdentityError('INVALID_TOKEN');
      await tx.marketplaceAccount.update({ where: { id: record.accountId }, data: { passwordHash } });
      await tx.marketplaceSession.updateMany({
        where: { accountId: record.accountId, revokedAt: null }, data: { revokedAt: now() },
      });
      return { success: true };
    });
  }

  async function applyAs(accountId, input) {
    const data = validateApplication(input);
    const account = await prisma.marketplaceAccount.findUnique({ where: { id: accountId } });
    if (!account || !account.emailVerifiedAt || account.disabledAt) throw new IdentityError('UNAUTHENTICATED', 401);
    const existing = await prisma.marketplaceApplication.findUnique({
      where: { accountId_role: { accountId, role: data.role } },
    });
    if (existing) return { role: existing.role, status: existing.status };
    try {
      const applied = await prisma.marketplaceApplication.create({
        data: { ...data, status: 'PENDING_REVIEW', accountId },
      });
      return { role: applied.role, status: applied.status };
    } catch (e) {
      if (e.code !== 'P2002') throw e;
      const current = await prisma.marketplaceApplication.findUnique({
        where: { accountId_role: { accountId, role: data.role } },
      });
      return { role: current.role, status: current.status };
    }
  }

  function validateApplication(input) {
    const role = input?.role;
    if ((role !== 'MERCHANT' && role !== 'COURIER') || !allowedRoles.has(role)) throw new IdentityError('INVALID_APPLICATION');
    if (role === 'MERCHANT') {
      const businessName = trimmed(input.businessName, 120);
      if (businessName.length < 2 || businessName.length > 120 ||
        !BUSINESS_TYPES.has(input.businessType) || !DELIVERY_MODES.has(input.deliveryMode)) {
        throw new IdentityError('INVALID_APPLICATION');
      }
      return { role, businessName, businessType: input.businessType, deliveryMode: input.deliveryMode };
    }
    if (!VEHICLES.has(input.vehicle) || !DELIVERY_MODES.has(input.network)) throw new IdentityError('INVALID_APPLICATION');
    return { role, vehicle: input.vehicle, network: input.network };
  }

  async function listApplications(status = 'PENDING_REVIEW') {
    if (!['PENDING_REVIEW','APPROVED','REJECTED','SUSPENDED'].includes(status)) throw new IdentityError('INVALID_FILTER');
    const rows = await prisma.marketplaceApplication.findMany({
      where: { role: { in: ['MERCHANT','COURIER'] }, status }, orderBy: { createdAt: 'asc' }, take: 50,
      select: { id: true, role: true, status: true, businessName: true, businessType: true,
        deliveryMode: true, vehicle: true, network: true, createdAt: true,
        account: { select: { fullName: true, email: true, city: true, phone: true, emailVerifiedAt: true } } },
    });
    return { applications: rows };
  }

  async function reviewApplication(applicationId, reviewerId, decision) {
    if (typeof applicationId !== 'string' || !applicationId || !['APPROVED','REJECTED'].includes(decision)) {
      throw new IdentityError('INVALID_REVIEW');
    }
    const application = await prisma.marketplaceApplication.findUnique({
      where: { id: applicationId },
      include: { account: { select: { emailVerifiedAt: true, disabledAt: true, fullName: true, phone: true, email: true } } },
    });
    if (!application || application.role === 'BUYER') throw new IdentityError('APPLICATION_NOT_FOUND', 404);
    const account = application.account;
    if (!account.emailVerifiedAt || account.disabledAt ||
        application.status !== 'PENDING_REVIEW') throw new IdentityError('APPLICATION_NOT_PENDING', 409);
    // Aprobar un repartidor provisiona su identidad de red (MarketplaceNetworkCourier
    // PENDING_VERIFICATION) ANTES de marcar la solicitud: si falla, la solicitud queda
    // PENDING_REVIEW y se puede reintentar. provisionCourier es idempotente por cuenta.
    // Ops verifica despues (VERIFIED). Aprobar NO es activacion, publicacion ni pagos.
    if (decision === 'APPROVED' && application.role === 'COURIER' && provisionCourier) {
      await provisionCourier({ accountId: application.accountId, name: account.fullName,
        phone: account.phone, email: account.email, vehicleType: application.vehicle });
    }
    const updated = await prisma.marketplaceApplication.updateMany({
      where: { id: applicationId, status: 'PENDING_REVIEW' },
      data: { status: decision, reviewedAt: now(), reviewedByUserId: reviewerId },
    });
    if (updated.count !== 1) throw new IdentityError('APPLICATION_NOT_PENDING', 409);
    return { id: applicationId, status: decision };
  }

  return { register, resendVerification, verifyEmail, login, authenticateCourier, currentSession, logout,
    forgotPassword, resetPassword, applyAs, listApplications, reviewApplication };
}

module.exports = {
  createMarketplaceIdentityService, IdentityError, validateSignup, hashToken,
  validToken, SESSION_MS,
};
