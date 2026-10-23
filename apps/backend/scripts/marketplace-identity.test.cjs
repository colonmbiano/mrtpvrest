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
  prisma.marketplaceApplication = {
    findUnique: async ({ where }) => {
      if (where.id) return applications.find(x => x.id === where.id) || null;
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
  phone: '722 123 4567', city: 'Colorines', password: 'Frase Larga Segura 2026!' };
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
  assert.deepEqual(await x.service.verifyEmail(token), {verified:true});
  assert.equal(x.applications[0].status,'APPROVED');
  await failCode(()=>x.service.verifyEmail(token),'INVALID_TOKEN');
});

test('merchant and courier require review after verification and do not create tenants', async () => {
  for(const data of [merchant,courier]){
    const x=fixture();
    await x.service.register(data);
    await x.service.verifyEmail(extractToken(x.emails[0].html));
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
