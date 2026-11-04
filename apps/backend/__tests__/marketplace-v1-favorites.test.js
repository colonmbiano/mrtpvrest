'use strict';

// Tiendas favoritas del comprador (app del cliente): /api/marketplace/v1/favorites y su
// adaptador Prisma. Sin BD: Prisma es un fake.

const express = require('express');
const request = require('supertest');
const { createMarketplaceV1Adapters } = require('../src/lib/marketplace-v1-prisma');
const { BuyerIdentityError } = require('../src/lib/marketplace-buyer-identity');

const bearer = async req => {
  if (req.headers.authorization === 'Bearer buyer') return 'acc-1';
  if (req.headers['x-buyer-id']) return 'guest:abc';
  throw new BuyerIdentityError('INVALID_BUYER_IDENTITY', 'Token de comprador invalido');
};
function app(service) {
  const a = express();
  a.use('/api/marketplace/v1/favorites', require('../src/routes/marketplace-favorites-v1.routes')({ service, resolveAccount: bearer }));
  return a;
}
const path = '/api/marketplace/v1/favorites';

describe('/api/marketplace/v1/favorites', () => {
  it('lista, agrega (idempotente) y quita con la cuenta del Bearer', async () => {
    const service = {
      list: jest.fn(async () => [{ slug: 'tacos', name: 'Tacos', logo: null, open: true, addedAt: '2026-11-02T10:00:00.000Z' }]),
      add: jest.fn(async (_acc, slug) => ({ slug, created: slug === 'tacos' })),
      remove: jest.fn(async () => undefined),
    };
    const a = app(service);
    const list = await request(a).get(path).set('Authorization', 'Bearer buyer');
    expect(list.status).toBe(200);
    expect(list.headers['cache-control']).toBe('no-store');
    expect(list.body.merchants[0].slug).toBe('tacos');
    expect(service.list).toHaveBeenCalledWith('acc-1');
    const created = await request(a).put(`${path}/tacos`).set('Authorization', 'Bearer buyer');
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ slug: 'tacos', favorite: true });
    expect((await request(a).put(`${path}/pizza`).set('Authorization', 'Bearer buyer')).status).toBe(200);
    expect((await request(a).delete(`${path}/tacos`).set('Authorization', 'Bearer buyer')).status).toBe(204);
    expect(service.remove).toHaveBeenCalledWith('acc-1', 'tacos');
  });

  it('sin Bearer o con id de invitado no hay favoritos', async () => {
    const service = { list: jest.fn(), add: jest.fn(), remove: jest.fn() };
    const a = app(service);
    expect((await request(a).get(path)).status).toBe(401);
    expect((await request(a).put(`${path}/tacos`).set('X-Buyer-Id', 'guest-browser')).status).toBe(401);
    expect((await request(a).delete(`${path}/tacos`).set('Authorization', 'Bearer otro')).status).toBe(401);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.add).not.toHaveBeenCalled();
    expect(service.remove).not.toHaveBeenCalled();
  });

  it('valida el slug, responde 404 si la tienda no está publicada y 409 al llegar al máximo', async () => {
    const service = { list: jest.fn(), remove: jest.fn(),
      add: jest.fn(async (_acc, slug) => (slug === 'oculta' ? null : { slug, limitReached: true })) };
    const a = app(service);
    const bad = await request(a).put(`${path}/Tienda%20Mala`).set('Authorization', 'Bearer buyer');
    expect(bad.status).toBe(400);
    expect(bad.body.errorCode).toBe('INVALID_MERCHANT');
    expect((await request(a).put(`${path}/oculta`).set('Authorization', 'Bearer buyer')).status).toBe(404);
    const full = await request(a).put(`${path}/tacos`).set('Authorization', 'Bearer buyer');
    expect(full.status).toBe(409);
    expect(full.body.errorCode).toBe('FAVORITES_LIMIT');
  });

  it('sin la bandera v1 responde 503', async () => {
    const saved = process.env.MARKETPLACE_V1_ORDERS_ENABLED;
    delete process.env.MARKETPLACE_V1_ORDERS_ENABLED;
    let a;
    jest.isolateModules(() => {
      a = express();
      a.use(path, require('../src/routes/marketplace-favorites-v1.routes')({ resolveAccount: bearer }));
    });
    const res = await request(a).get(path).set('Authorization', 'Bearer buyer');
    if (saved !== undefined) process.env.MARKETPLACE_V1_ORDERS_ENABLED = saved;
    expect(res.status).toBe(503);
    expect(res.body.errorCode).toBe('FAVORITES_UNAVAILABLE');
  });
});

describe('adaptador Prisma de favoritos', () => {
  function fakePrisma({ merchants = [], favorites = [] } = {}) {
    const calls = [];
    const rows = favorites.map(f => ({ ...f }));
    return {
      calls, rows,
      restaurant: { async findFirst(args) {
        calls.push(['restaurant.findFirst', args]);
        const hit = merchants.find(m => m.slug === args.where.slug);
        // El filtro de publicación (marketplaceMembership) solo lo cumplen los aprobados.
        if (!hit || (args.where.marketplaceMembership && !hit.approved)) return null;
        return { id: hit.id, slug: hit.slug };
      } },
      marketplaceFavorite: {
        async findMany(args) {
          calls.push(['favorite.findMany', args]);
          return rows.filter(r => r.accountId === args.where.accountId)
            .map(r => ({ createdAt: r.createdAt, merchant: merchants.find(m => m.id === r.merchantId) }))
            .filter(r => r.merchant?.approved)
            .map(r => ({ createdAt: r.createdAt, merchant: { slug: r.merchant.slug, name: r.merchant.name, logoUrl: r.merchant.logoUrl ?? null, config: null } }));
        },
        async count(args) { return rows.filter(r => r.accountId === args.where.accountId).length; },
        async findFirst(args) { return rows.find(r => r.accountId === args.where.accountId && r.merchantId === args.where.merchantId) ?? null; },
        async upsert(args) {
          calls.push(['favorite.upsert', args]);
          const { accountId, merchantId } = args.where.accountId_merchantId;
          if (!rows.some(r => r.accountId === accountId && r.merchantId === merchantId)) rows.push({ id: `f${rows.length + 1}`, accountId, merchantId, createdAt: new Date() });
        },
        async deleteMany(args) {
          calls.push(['favorite.deleteMany', args]);
          for (let i = rows.length - 1; i >= 0; i--) if (rows[i].accountId === args.where.accountId && rows[i].merchantId === args.where.merchantId) rows.splice(i, 1);
        },
      },
    };
  }
  const merchants = [{ id: 'r1', slug: 'tacos', name: 'Tacos', approved: true, logoUrl: 'https://img/tacos.png' },
    { id: 'r2', slug: 'oculta', name: 'Oculta', approved: false }];

  it('solo agrega tiendas publicadas, una vez por cuenta, y lista solo las publicadas', async () => {
    const prisma = fakePrisma({ merchants, favorites: [{ id: 'f0', accountId: 'acc-1', merchantId: 'r2', createdAt: new Date() }] });
    const { favorites } = createMarketplaceV1Adapters({ prisma, commissionBps: 1500 });
    expect(await favorites.add('acc-1', 'oculta')).toBeNull();
    expect(prisma.calls.find(c => c[0] === 'restaurant.findFirst')[1].where).toEqual(expect.objectContaining({ slug: 'oculta', isActive: true }));
    expect(await favorites.add('acc-1', 'tacos')).toEqual({ slug: 'tacos', created: true });
    expect(await favorites.add('acc-1', 'tacos')).toEqual({ slug: 'tacos', created: false });
    expect(prisma.rows.filter(r => r.merchantId === 'r1')).toHaveLength(1);
    const list = await favorites.list('acc-1');
    expect(list).toEqual([{ slug: 'tacos', name: 'Tacos', logo: 'https://img/tacos.png', open: false, addedAt: expect.any(String) }]);
    // La consulta filtra por la cuenta y por el mismo criterio de publicación del directorio.
    const where = prisma.calls.find(c => c[0] === 'favorite.findMany')[1].where;
    expect(where.accountId).toBe('acc-1');
    expect(where.merchant.is).toEqual(expect.objectContaining({ isActive: true, marketplaceMembership: { is: { status: 'APPROVED' } } }));
    expect(await favorites.list('acc-2')).toEqual([]);
  });

  it('quitar funciona aunque la tienda ya no esté publicada y no toca a otras cuentas', async () => {
    const prisma = fakePrisma({ merchants, favorites: [
      { id: 'f1', accountId: 'acc-1', merchantId: 'r2', createdAt: new Date() },
      { id: 'f2', accountId: 'acc-2', merchantId: 'r2', createdAt: new Date() }] });
    const { favorites } = createMarketplaceV1Adapters({ prisma, commissionBps: 1500 });
    await favorites.remove('acc-1', 'oculta');
    expect(prisma.rows.map(r => r.id)).toEqual(['f2']);
    await favorites.remove('acc-1', 'no-existe');
    expect(prisma.rows.map(r => r.id)).toEqual(['f2']);
  });

  it('no pasa del máximo de favoritos', async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ id: `x${i}`, accountId: 'acc-1', merchantId: `other-${i}`, createdAt: new Date() }));
    const prisma = fakePrisma({ merchants, favorites: many });
    const { favorites } = createMarketplaceV1Adapters({ prisma, commissionBps: 1500 });
    expect(await favorites.add('acc-1', 'tacos')).toEqual({ slug: 'tacos', limitReached: true });
    expect(prisma.calls.some(c => c[0] === 'favorite.upsert')).toBe(false);
  });
});
