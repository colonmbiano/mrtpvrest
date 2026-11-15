'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMarketplaceIdentityService, IdentityError, validateSignup, hashToken } = require('../src/lib/marketplace-identity');

function fixture() {
  const accounts = [], applications = [], tokens = [], sessions = [], emails = [];
  let seq = 0;
  const id = () => String(++seq);
  const prisma = {};
  prisma.$transaction = fn => fn(prisma);
  prisma.marketplaceAccount = {
    findUnique: async ({ where }) => accounts.find(x => Object.keys(where).every(k => x[k] === where[k])) || null,
    create: async ({ data }) => {
      if (accounts.some(a => a.email === data.email)) { const e = new Error('duplicate'); e.code = 'P2002'; throw e; }
      const a = { id: 'a' + id(), ...data, applications: [], emailVerifiedAt: null, disabledAt: null };
      delete a.applications.create;
      a.applications = [];
      accounts.push(a);
      const app = { id: 'p' + id(), accountId: a.id, ...data.applications.create };
      applications.push(app); a.applications.push(app);
      return a;
    },
    update: async ({ where, data }) => {
      const a = accounts.find(x => x.id === where.id);
      assert.ok(a); Object.assign(a, data); return a;
    },
  };
  prisma.marketplaceAccount.updateMany = async ({ where, data }) => {
    const rows = accounts.filter(row => row.id === where.id && (where.termsAcceptedAt !== null || !row.termsAcceptedAt));
    rows.forEach(row => Object.assign(row, data));
    return { count: rows.length };
  };
  prisma.marketplaceApplication = {
    findUnique: async ({ where }) => {
      if (where.id) {
        const app = applications.find(x => x.id === where.id);
        return app ? { ...app, account: accounts.find(a => a.id === app.accountId) } : null;
      }
      return applications.find(x => x.accountId === where.accountId_role.accountId && x.role === where.accountId_role.role) || null;
    },
    create: async ({ data }) => {
      if (applications.some(p => p.accountId === data.accountId && p.role === data.role)) {
        const e = new Error('duplicate'); e.code = 'P2002'; throw e;
      }
      const x = { ...data, id: 'p' + id(), createdAt: new Date() };
      applications.push(x); accounts.find(a=>a.id===x.accountId)?.applications.push(x); return x;
    },
    updateMany: async ({ where, data }) => {
      let count = 0;
      for(const p of applications) {
        if(where.id && p.id !== where.id) continue;
        if(where.accountId && p.accountId !== where.accountId) continue;
        if(where.status && p.status !== where.status) continue;
        if(where.role && (typeof where.role === 'string' ? p.role !== where.role : !where.role.in.includes(p.role))) continue;
        Object.assign(p, data); count++;
      }
      return { count };
    },
    findMany: async ({ where }) => applications.filter(p =>
      (!where.status || p.status === where.status)
      && (!where.role || where.role.in.includes(p.role))).slice(0,50).map(p => ({
        ...p, account: accounts.find(a=>a.id===p.accountId),
      })),
  };
  prisma.marketplaceAuthToken = {
    create: async ({ data }) => {
      const x = { id: 't' + id(), ...data, consumedAt: null };
      tokens.push(x); return x;
    },
    findUnique: async ({ where }) => tokens.find(x => x.tokenHash === where.tokenHash) || null,
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const t of tokens) {
        if (t.id !== where.id || t.consumedAt !== null || t.expiresAt <= where.expiresAt.gt) continue;
        Object.assign(t, data); count++;
      }
      return { count };
    },
  };
  prisma.marketplaceSession = {
    create: async ({ data }) => {
      const x = { id: 's' + id(), ...data, revokedAt: null }; sessions.push(x); return x;
    },
    findUnique: async ({ where }) => {
      const row = sessions.find(s => s.tokenHash === where.tokenHash);
      return row ? { ...row, account: accounts.find(a => a.id === row.accountId) } : null;
    },
    updateMany: async ({ where, data }) => {
      let count = 0;
      for(const row of sessions) {
        if (where.tokenHash && row.tokenHash !== where.tokenHash) continue;
        if (where.accountId && row.accountId !== where.accountId) continue;
        if (where.revokedAt === null && row.revokedAt) continue;
        Object.assign(row, data); count++;
      }
      return { count };
    },
  };
  const service = createMarketplaceIdentityService({
    prisma, sendEmail: async (to, subject, html) => emails.push({ to, subject, html }),
    publicOrigin: 'https://marketplace-staging.example.net',
  });
  return { prisma, accounts, applications, tokens, sessions, emails, service };
}
const buyer = { role:'BUYER', fullName: 'María Pérez', email: 'Maria@Correo.mx',
  termsAccepted: true, phone: '722 123 4567', city: 'Colorines', password: 'Frase Larga Segura 2026!' };
const merchant = { ...buyer, role:'MERCHANT', businessName: 'Negocio Local',
  businessType: 'RESTAURANT', deliveryMode: 'BOTH' };
const courier = { ...buyer, role:'COURIER', vehicle:'MOTO', network:'SHARED' };
const extractToken = html => {
  const m = html.match(/#token=([a-f0-9]{64})/);
  assert.ok(m, 'only fragment token should appear'); return m[1];
};
const failCode = async (fn, code) => assert.rejects(fn, e => e instanceof IdentityError && e.code===code);

test('roles, passwords and constrained signup fields reject invalid inputs', () => {
  assert.equal(validateSignup(buyer).email, 'maria@correo.mx');
  assert.equal(validateSignup(merchant).application.role, 'MERCHANT');
  assert.equal(validateSignup(courier).application.role, 'COURIER');
  for (const invalid of [{...buyer,role:'SUPER_ADMIN'}, {...buyer,password:'short'},
    {...merchant,businessType:'UNKNOWN'}, {...courier,vehicle:'SPACESHIP'},
    {...buyer,email:'bad'}, {...buyer,phone:'123'}]) {
    assert.throws(()=>validateSignup(invalid), e=>e.code==='INVALID_SIGNUP');
  }
});

test('authenticateCourier: valid creds + approved COURIER profile, else rejects (password grant APK)', async () => {
  const x = fixture();
  await x.service.register(courier);
  // Simula verificación de correo + aprobación del rol por el admin.
  x.accounts[0].emailVerifiedAt = new Date();
  x.applications[0].status = 'APPROVED';
  assert.deepEqual(await x.service.authenticateCourier({ email: courier.email, password: courier.password }),
    { accountId: x.accounts[0].id });
  // Contraseña incorrecta.
  await failCode(() => x.service.authenticateCourier({ email: courier.email, password: 'otra-frase-larga-2026' }), 'INVALID_CREDENTIALS');
  // Perfil de courier no aprobado.
  x.applications[0].status = 'PENDING_REVIEW';
  await failCode(() => x.service.authenticateCourier({ email: courier.email, password: courier.password }), 'COURIER_PROFILE_REQUIRED');
  // Correo sin verificar.
  x.applications[0].status = 'APPROVED';
  x.accounts[0].emailVerifiedAt = null;
  await failCode(() => x.service.authenticateCourier({ email: courier.email, password: courier.password }), 'INVALID_CREDENTIALS');
});

test('approving a COURIER application provisions its network identity before marking approved', async () => {
  const x = fixture();
  const provisioned = [];
  const svc = createMarketplaceIdentityService({ prisma: x.prisma, sendEmail: async () => {},
    publicOrigin: 'https://marketplace-staging.example.net',
    provisionCourier: async data => { provisioned.push(data); } });
  await svc.register(courier);
  x.accounts[0].emailVerifiedAt = new Date();
  x.applications[0].status = 'PENDING_REVIEW';
  const appId = x.applications[0].id;
  assert.deepEqual(await svc.reviewApplication(appId, 'rev-1', 'APPROVED'), { id: appId, status: 'APPROVED' });
  assert.equal(x.applications[0].status, 'APPROVED');
  assert.equal(provisioned.length, 1);
  assert.equal(provisioned[0].accountId, x.accounts[0].id);
  assert.equal(provisioned[0].vehicleType, 'MOTO');
  assert.equal(provisioned[0].email, 'maria@correo.mx');
  assert.equal(provisioned[0].name, x.accounts[0].fullName);
  assert.equal(provisioned[0].phone, x.accounts[0].phone);
});

test('rejecting does not provision; a failed provision leaves the application pending (retryable)', async () => {
  const x = fixture();
  const provisioned = [];
  const ok = createMarketplaceIdentityService({ prisma: x.prisma, sendEmail: async () => {},
    publicOrigin: 'https://marketplace-staging.example.net', provisionCourier: async d => { provisioned.push(d); } });
  await ok.register(courier);
  x.accounts[0].emailVerifiedAt = new Date();
  x.applications[0].status = 'PENDING_REVIEW';
  await ok.reviewApplication(x.applications[0].id, 'r', 'REJECTED');
  assert.equal(provisioned.length, 0);
  assert.equal(x.applications[0].status, 'REJECTED');

  const y = fixture();
  const bad = createMarketplaceIdentityService({ prisma: y.prisma, sendEmail: async () => {},
    publicOrigin: 'https://marketplace-staging.example.net', provisionCourier: async () => { throw new Error('boom'); } });
  await bad.register(courier);
  y.accounts[0].emailVerifiedAt = new Date();
  y.applications[0].status = 'PENDING_REVIEW';
  await assert.rejects(bad.reviewApplication(y.applications[0].id, 'r', 'APPROVED'));
  assert.equal(y.applications[0].status, 'PENDING_REVIEW');
});

test('signup writes hash, creates pending profile and mails only one-use opaque fragment token', async () => {
  const x = fixture();
  assert.deepEqual(await x.service.register(buyer), {accepted:true});
  assert.equal(x.accounts[0].email,'maria@correo.mx');
  assert.notEqual(x.accounts[0].passwordHash,buyer.password);
  assert.equal(x.applications[0].status,'PENDING_EMAIL');
  assert.equal(x.emails.length,1);
  const token=extractToken(x.emails[0].html);
  assert.equal(x.tokens[0].tokenHash,hashToken(token));
  assert.ok(!JSON.stringify(x.accounts).includes(token));
  assert.deepEqual(await x.service.register(buyer),{accepted:true});
  assert.equal(x.accounts.length,1);
  assert.equal(x.emails.length,1);
  await failCode(()=>x.service.login(buyer),'INVALID_CREDENTIALS');
  assert.deepEqual(await x.service.verifyEmail(token), {verified:true, roles:['BUYER']});
  assert.equal(x.applications[0].status,'APPROVED');
  await failCode(()=>x.service.verifyEmail(token),'INVALID_TOKEN');
});

test('merchant and courier require review after verification and do not create tenants', async () => {
  for(const data of [merchant,courier]){
    const x=fixture();
    await x.service.register(data);
    assert.deepEqual(await x.service.verifyEmail(extractToken(x.emails[0].html)), { verified: true, roles: [data.role] });
    assert.equal(x.applications[0].status,'PENDING_REVIEW');
    assert.equal(x.prisma.tenant, undefined);
    const approved=await x.service.reviewApplication(x.applications[0].id,'superadmin-1','APPROVED');
    assert.equal(approved.status,'APPROVED');
    await failCode(()=>x.service.reviewApplication(x.applications[0].id,'superadmin-1','APPROVED'),'APPLICATION_NOT_PENDING');
  }
});

test('login session only in hash, logout revoked and cannot authenticate again', async () => {
  const x=fixture();
  await x.service.register(buyer);
  await x.service.verifyEmail(extractToken(x.emails[0].html));
  const {token,account}=await x.service.login({email:buyer.email,password:buyer.password});
  assert.equal(account.profiles[0].role,'BUYER');
  assert.equal(x.sessions[0].tokenHash,hashToken(token));
  const {account: current}=await x.service.currentSession(token);
  assert.equal(current.id,account.id);
  await x.service.logout(token);
  await failCode(()=>x.service.currentSession(token),'UNAUTHENTICATED');
  await failCode(()=>x.service.login({email:buyer.email,password:'wrong'}),'INVALID_CREDENTIALS');
});

test('verified store owner (User ADMIN) can log into marketplace identity and gets BUYER + MERCHANT profiles', async () => {
  const bcrypt = require('bcryptjs');
  const x = fixture();
  const storePasswordHash = await bcrypt.hash('MiTiendaSegura2026!', 10);
  x.prisma.user = {
    findUnique: async ({ where }) => where.email === 'tienda@ejemplo.mx' ? {
      id: 'u1',
      email: 'tienda@ejemplo.mx',
      name: 'Eduardo Tienda',
      phone: '7293356220',
      role: 'ADMIN',
      isActive: true,
      passwordHash: storePasswordHash,
      tenant: { id: 't1', name: 'Master Burguer', emailVerifiedAt: new Date() },
      restaurant: { id: 'r1', name: 'Master Burguer', businessType: 'RESTAURANT' },
    } : null,
  };
  x.prisma.marketplaceAccount.create = async ({ data }) => {
    const rawApps = Array.isArray(data.applications?.create) ? data.applications.create : [data.applications.create];
    const a = { id: 'a99', ...data, applications: [] };
    delete a.applications;
    a.applications = rawApps.map((app, idx) => ({ id: 'pa' + idx, accountId: 'a99', ...app }));
    x.accounts.push(a);
    x.applications.push(...a.applications);
    return a;
  };
  const { token, account } = await x.service.login({ email: '  Tienda@Ejemplo.mx ', password: 'MiTiendaSegura2026!' });
  assert.ok(token);
  assert.equal(account.email, 'tienda@ejemplo.mx');
  assert.equal(account.emailVerified, true);
  assert.deepEqual(account.profiles.map(p => p.role).sort(), ['BUYER', 'MERCHANT']);
});

test('reset tokens are one-time, revoke all sessions and never reveal unknown emails', async () => {
  const x=fixture();
  await x.service.register(buyer);
  await x.service.verifyEmail(extractToken(x.emails[0].html));
  const {token:oldSession}=await x.service.login({email:buyer.email,password:buyer.password});
  assert.deepEqual(await x.service.forgotPassword('unknown@correo.mx'), {accepted:true});
  assert.equal(x.emails.length,1);
  await x.service.forgotPassword(buyer.email);
  const reset=extractToken(x.emails[1].html);
  await x.service.resetPassword(reset,'Nueva frase segura 2026!');
  await failCode(()=>x.service.currentSession(oldSession),'UNAUTHENTICATED');
  await failCode(()=>x.service.resetPassword(reset,'Otra frase segura 2026!'),'INVALID_TOKEN');
  const session=await x.service.login({email:buyer.email,password:'Nueva frase segura 2026!'});
  assert.ok(session.token);
});

test('verified buyers may request merchant profile without a duplicate global account', async () => {
  const x=fixture();
  await x.service.register(buyer);
  await x.service.verifyEmail(extractToken(x.emails[0].html));
  const applied=await x.service.applyAs(x.accounts[0].id,merchant);
  assert.equal(applied.status,'PENDING_REVIEW');
  assert.equal(x.accounts.length,1);
  assert.equal(x.applications.length,2);
  assert.equal((await x.service.applyAs(x.accounts[0].id,merchant)).status,'PENDING_REVIEW');
  const list=await x.service.listApplications();
  assert.equal(list.applications.length,1);
});

test('HTTP routes require exact Origin and keep bearer JWT distinct from buyer cookies', async () => {
  const express = require('express');
  const request = require('supertest');
  const { createMarketplaceIdentityRouter } = require('../src/routes/marketplace-identity.routes');
  const x = fixture();
  const origin = 'https://marketplace-staging.example.net';
  const app = express();
  app.use(express.json());
  app.use('/api/marketplace/identity', createMarketplaceIdentityRouter({
    prisma: x.prisma, sendEmail: async (to, subject, html) => x.emails.push({to,subject,html}),
    origin, captchaCheck: async () => ({ok:true}),
    authenticateAdmin: (req, res, next) => {
      if(req.headers.authorization !== 'Bearer valid-superadmin-token') return res.sendStatus(401);
      req.user={ id:'superadmin-1', role:'SUPER_ADMIN' }; next();
    },
  }));
  const path='/api/marketplace/identity';
  assert.equal((await request(app).post(path+'/register').send(buyer)).status,403);
  assert.equal((await request(app).post(path+'/register').set('Origin',origin).send(buyer)).status,202);
  assert.equal(x.accounts.length,1);
  const raw=extractToken(x.emails[0].html);
  assert.equal((await request(app).post(path+'/verify-email').set('Origin',origin).send({token:raw})).status,200);
  const login=await request(app).post(path+'/login').set('Origin',origin).send({email:buyer.email,password:buyer.password});
  assert.equal(login.status,200);
  assert.ok(!JSON.stringify(login.body).includes('token'));
  const rawCookie=login.headers['set-cookie']?.[0];
  assert.match(rawCookie, /HttpOnly/);
  assert.match(rawCookie, /Secure/);
  assert.match(rawCookie, /SameSite=Strict/);
  assert.equal((await request(app).get(path+'/me').set('Cookie',rawCookie)).status,200);
  assert.equal((await request(app).get(path+'/admin/applications')).status,401);
  assert.equal((await request(app).get(path+'/admin/applications').set('Authorization','Bearer valid-superadmin-token')).status,200);
  assert.equal((await request(app).post(path+'/logout').set('Origin',origin).set('Cookie',rawCookie)).status,200);
  assert.equal((await request(app).get(path+'/me').set('Cookie',rawCookie)).status,401);
});

// ── Cuenta del comprador en producción y emisor del token (app del cliente) ──

test('mount rules: off by default, staging unchanged, production only with full config', () => {
  const { resolveIdentityMount } = require('../src/lib/marketplace-identity-mount');
  const secret = 'b'.repeat(40);
  const prod = { MARKETPLACE_IDENTITY_ENABLED: 'true', MARKETPLACE_IDENTITY_MODE: 'production',
    RESEND_API_KEY: 're_x', TURNSTILE_SECRET_KEY: 'ts_x', MARKETPLACE_IDENTITY_ORIGIN: 'https://client.mrtpvrest.com',
    MARKETPLACE_BUYER_JWT_SECRET: secret, JWT_SECRET: 'store-secret' };
  assert.deepEqual(resolveIdentityMount({}), { mount: false });
  assert.deepEqual(resolveIdentityMount({ ...prod, MARKETPLACE_IDENTITY_ENABLED: 'false' }), { mount: false });
  assert.deepEqual(resolveIdentityMount(prod), { mount: true, mode: 'production', roles: ['BUYER'] });
  assert.equal(resolveIdentityMount({ ...prod, MARKETPLACE_IDENTITY_ORIGIN: 'https://mrtpvrest.com' }).mount, true);
  // Opt-in de roles en producción: BUYER siempre; MERCHANT/COURIER solo si se piden.
  assert.deepEqual(resolveIdentityMount({ ...prod, MARKETPLACE_IDENTITY_EXTRA_ROLES: 'COURIER' }).roles, ['BUYER', 'COURIER']);
  assert.deepEqual(resolveIdentityMount({ ...prod, MARKETPLACE_IDENTITY_EXTRA_ROLES: ' courier , merchant ' }).roles,
    ['BUYER', 'MERCHANT', 'COURIER']);
  // Orden determinista sin importar el orden de entrada ni duplicados.
  assert.deepEqual(resolveIdentityMount({ ...prod, MARKETPLACE_IDENTITY_EXTRA_ROLES: 'COURIER,COURIER' }).roles, ['BUYER', 'COURIER']);
  // Fail-closed: valores desconocidos o vacíos no amplían el registro.
  assert.deepEqual(resolveIdentityMount({ ...prod, MARKETPLACE_IDENTITY_EXTRA_ROLES: 'ADMIN, buyer, ' }).roles, ['BUYER']);
  assert.deepEqual(resolveIdentityMount({ ...prod, MARKETPLACE_IDENTITY_EXTRA_ROLES: '' }).roles, ['BUYER']);
  // Sin configuración completa no se monta, y no detiene el arranque.
  const off = resolveIdentityMount({ MARKETPLACE_IDENTITY_ENABLED: 'true', MARKETPLACE_IDENTITY_MODE: 'production' });
  assert.equal(off.mount, false);
  assert.deepEqual(off.missing, ['RESEND_API_KEY', 'TURNSTILE_SECRET_KEY', 'MARKETPLACE_IDENTITY_ORIGIN', 'MARKETPLACE_BUYER_JWT_SECRET']);
  for (const origin of ['https://evil.example.com', 'http://client.mrtpvrest.com', 'https://client.mrtpvrest.com/',
    'https://client.mrtpvrest.com/app', 'https://mrtpvrest.com.evil.io', 'https://u:p@client.mrtpvrest.com']) {
    assert.deepEqual(resolveIdentityMount({ ...prod, MARKETPLACE_IDENTITY_ORIGIN: origin }).missing, ['MARKETPLACE_IDENTITY_ORIGIN'], origin);
  }
  // La clave del comprador no puede ser la de la tienda ni corta.
  const shared = 'store-secret'.padEnd(40, 'x');
  assert.deepEqual(resolveIdentityMount({ ...prod, MARKETPLACE_BUYER_JWT_SECRET: shared, JWT_SECRET: shared }).missing,
    ['MARKETPLACE_BUYER_JWT_SECRET']);
  assert.deepEqual(resolveIdentityMount({ ...prod, MARKETPLACE_BUYER_JWT_SECRET: 'corta' }).missing, ['MARKETPLACE_BUYER_JWT_SECRET']);
  // staging conserva sus barreras y detiene el arranque si están mal.
  assert.throws(() => resolveIdentityMount({ ...prod, MARKETPLACE_IDENTITY_MODE: 'staging', DATABASE_URL: 'postgresql://h/prod' }), /isolated staging/);
  assert.deepEqual(resolveIdentityMount({ ...prod, MARKETPLACE_IDENTITY_MODE: 'staging', DATABASE_URL: 'postgresql://h/marketplace_staging' }),
    { mount: true, mode: 'staging', roles: null });
  assert.throws(() => resolveIdentityMount({ ...prod, MARKETPLACE_IDENTITY_MODE: 'prod' }), /staging or production/);
  // Ningún resultado lleva valores de variables.
  assert.ok(!JSON.stringify(resolveIdentityMount({ ...prod, MARKETPLACE_BUYER_JWT_SECRET: 'corta' })).includes('corta'));
});

function identityApp(x, { origin, roles = null, env } = {}) {
  const express = require('express');
  const { createMarketplaceIdentityRouter } = require('../src/routes/marketplace-identity.routes');
  const { signMarketplaceToken } = require('../src/lib/marketplace-jwt');
  const app = express();
  app.use(express.json());
  app.use('/api/marketplace/identity', createMarketplaceIdentityRouter({
    prisma: x.prisma, sendEmail: async (to, subject, html) => x.emails.push({ to, subject, html }),
    origin, roles, captchaCheck: async () => ({ ok: true }),
    signBuyerToken: (claims, opts) => signMarketplaceToken('buyer', claims, { env, ...opts }),
  }));
  return app;
}

test('production router: only buyer accounts, no merchant or courier applications', async () => {
  const request = require('supertest');
  const x = fixture(); const origin = 'https://client.mrtpvrest.com'; const path = '/api/marketplace/identity';
  const app = identityApp(x, { origin, roles: ['BUYER'], env: {} });
  const rejected = await request(app).post(path + '/register').set('Origin', origin).send(merchant);
  assert.equal(rejected.status, 400); assert.equal(rejected.body.code, 'INVALID_SIGNUP');
  assert.equal(x.accounts.length, 0); assert.equal(x.emails.length, 0);
  assert.equal((await request(app).post(path + '/applications').set('Origin', origin).send({ role: 'MERCHANT' })).status, 404);
  await failCode(() => createMarketplaceIdentityService({ prisma: x.prisma, sendEmail: async () => {},
    publicOrigin: origin, roles: ['BUYER'] }).register(courier), 'INVALID_SIGNUP');
});

test('token endpoint issues a short buyer JWT that the v1 APIs accept, only from a live session', async () => {
  const request = require('supertest');
  const jwt = require('jsonwebtoken');
  const { createBuyerAccountResolver } = require('../src/lib/marketplace-buyer-identity');
  const env = { MARKETPLACE_BUYER_JWT_SECRET: 'c'.repeat(48), JWT_SECRET: 'store-secret-for-tests' };
  const x = fixture(); const origin = 'https://client.mrtpvrest.com'; const path = '/api/marketplace/identity';
  const app = identityApp(x, { origin, roles: ['BUYER'], env });

  assert.equal((await request(app).post(path + '/register').set('Origin', origin).send(buyer)).status, 202);
  assert.ok(x.emails[0].html.includes(origin + '/registro/verificar#token='));
  const raw = extractToken(x.emails[0].html);
  assert.equal((await request(app).post(path + '/verify-email').set('Origin', origin).send({ token: raw })).status, 200);
  assert.equal((await request(app).post(path + '/token').set('Origin', origin)).status, 401);
  const login = await request(app).post(path + '/login').set('Origin', origin).send({ email: buyer.email, password: buyer.password });
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  assert.match(cookie, /^__Host-mrtpv_market=[a-f0-9]{64}$/);

  // Sin Origin, o desde otro sitio, no hay token aunque llegue la cookie.
  assert.equal((await request(app).post(path + '/token').set('Cookie', cookie)).status, 403);
  assert.equal((await request(app).post(path + '/token').set('Cookie', cookie).set('Origin', 'https://evil.example.com')).status, 403);

  const issued = await request(app).post(path + '/token').set('Cookie', cookie).set('Origin', origin);
  assert.equal(issued.status, 200);
  assert.equal(issued.headers['cache-control'], 'no-store');
  assert.equal(issued.body.tokenType, 'Bearer'); assert.equal(issued.body.expiresIn, 900);
  const claims = jwt.decode(issued.body.token);
  assert.equal(claims.iss, 'mrtpvrest-marketplace'); assert.equal(claims.aud, 'mrtpvrest-marketplace-buyer');
  assert.equal(claims.role, 'BUYER'); assert.equal(claims.accountId, x.accounts[0].id);
  assert.equal(claims.exp - claims.iat, 900);
  assert.ok(!issued.body.token.includes(cookie.split('=')[1]), 'the JWT never carries the session');

  // El verificador de direcciones, cotización y orden v1 lo acepta y devuelve la cuenta.
  const resolve = createBuyerAccountResolver({ marketplaceSecret: () => env.MARKETPLACE_BUYER_JWT_SECRET,
    jwtSecret: () => env.JWT_SECRET });
  assert.equal(await resolve({ headers: { authorization: 'Bearer ' + issued.body.token } }), x.accounts[0].id);
  // La tienda no lo acepta: su clave es otra.
  assert.throws(() => jwt.verify(issued.body.token, env.JWT_SECRET));
  // Y no sirve como cookie de sesión.
  assert.equal((await request(app).get(path + '/me').set('Cookie', '__Host-mrtpv_market=' + issued.body.token)).status, 401);

  // Al cerrar sesión ya no se emiten tokens nuevos.
  assert.equal((await request(app).post(path + '/logout').set('Origin', origin).set('Cookie', cookie)).status, 200);
  assert.equal((await request(app).post(path + '/token').set('Cookie', cookie).set('Origin', origin)).status, 401);
});

test('token endpoint: no buyer profile, no buyer token; a missing key fails closed', async () => {
  const request = require('supertest');
  const x = fixture(); const origin = 'https://marketplace-staging.example.net'; const path = '/api/marketplace/identity';
  // staging admite negocios: una cuenta solo de negocio no es comprador.
  const app = identityApp(x, { origin, env: { MARKETPLACE_BUYER_JWT_SECRET: 'd'.repeat(48) } });
  assert.equal((await request(app).post(path + '/register').set('Origin', origin).send(merchant)).status, 202);
  await request(app).post(path + '/verify-email').set('Origin', origin).send({ token: extractToken(x.emails[0].html) });
  const login = await request(app).post(path + '/login').set('Origin', origin).send({ email: merchant.email, password: merchant.password });
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  const denied = await request(app).post(path + '/token').set('Cookie', cookie).set('Origin', origin);
  assert.equal(denied.status, 403); assert.equal(denied.body.code, 'BUYER_PROFILE_REQUIRED');

  // Con perfil de comprador pero sin clave dedicada: 503, nunca firma con la de la tienda.
  const profile = { id: 'pb', accountId: x.accounts[0].id, role: 'BUYER', status: 'APPROVED' };
  x.applications.push(profile); x.accounts[0].applications.push(profile);
  const noKey = identityApp(x, { origin, env: { JWT_SECRET: 'e'.repeat(48) } });
  const unavailable = await request(noKey).post(path + '/token').set('Cookie', cookie).set('Origin', origin);
  assert.equal(unavailable.status, 503); assert.equal(unavailable.body.code, 'IDENTITY_UNAVAILABLE');
  assert.ok(!JSON.stringify(unavailable.body).includes('e'.repeat(48)));
});


test('signup requires explicit acceptance and records a server timestamp', async () => {
  const x = fixture();
  for (const termsAccepted of [undefined, false, 'true', 1]) {
    await failCode(x.service.register({ ...buyer, termsAccepted }), 'TERMS_ACCEPTANCE_REQUIRED');
  }
  assert.equal(x.accounts.length, 0);
  await x.service.register(buyer);
  assert(x.accounts[0].termsAcceptedAt instanceof Date);
});

test('a legacy courier accepts once before receiving credentials', async () => {
  const x = fixture();
  await x.service.register(courier);
  const account = x.accounts[0];
  account.emailVerifiedAt = new Date();
  account.applications[0].status = 'APPROVED';
  account.termsAcceptedAt = null;
  await failCode(x.service.authenticateCourier({ ...courier, termsAccepted: false }), 'TERMS_ACCEPTANCE_REQUIRED');
  await x.service.authenticateCourier({ ...courier, termsAccepted: true });
  const acceptedAt = account.termsAcceptedAt;
  await x.service.authenticateCourier({ email: courier.email, password: courier.password });
  assert.equal(account.termsAcceptedAt, acceptedAt);
});
