'use strict';

const { BuyerIdentityError, createBuyerAccountResolver } = require('../lib/marketplace-buyer-identity');
const { defaultMarketplaceV1Services } = require('../lib/marketplace-v1-prisma');

// Mismo formato que el directorio v1 (lib/marketplace-merchants-v1.js).
const SLUG = /^[a-z0-9-]{1,100}$/;

// Tiendas favoritas del comprador (app del cliente). Solo la cuenta del Bearer: un id
// de invitado vive en un navegador y no tiene lista propia.
function createMarketplaceFavoritesV1Router({ Router, service, resolveAccount, buyerOptions } = {}) {
  const router = (Router || require('express').Router)();
  const accountFor = resolveAccount || createBuyerAccountResolver({ ...buyerOptions, allowGuest: false });
  const handle = action => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Vary', 'Authorization');
    try {
      const accountId = req.headers?.authorization !== undefined ? await accountFor(req) : null;
      if (typeof accountId !== 'string' || accountId.startsWith('guest:')) {
        throw new BuyerIdentityError('INVALID_BUYER_IDENTITY', 'Inicia sesion para guardar tiendas favoritas');
      }
      // Sin MARKETPLACE_V1_ORDERS_ENABLED no hay servicios v1: 503.
      const favorites = service || defaultMarketplaceV1Services()?.favorites;
      if (!favorites) return res.status(503).json({ error: 'Favoritos no disponibles', errorCode: 'FAVORITES_UNAVAILABLE' });
      return await action(favorites, accountId, req, res);
    } catch (error) {
      if (error instanceof BuyerIdentityError) return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
      return res.status(503).json({ error: 'Favoritos temporalmente no disponibles', errorCode: 'FAVORITES_UNAVAILABLE' });
    }
  };
  const slugOf = (req, res) => {
    const slug = req.params.slug;
    if (typeof slug === 'string' && SLUG.test(slug)) return slug;
    res.status(400).json({ error: 'Tienda invalida', errorCode: 'INVALID_MERCHANT' });
    return null;
  };

  // Mounted at /api/marketplace/v1/favorites.
  router.get('/', handle(async (favorites, accountId, req, res) => res.json({ merchants: await favorites.list(accountId) })));
  router.put('/:slug', handle(async (favorites, accountId, req, res) => {
    const slug = slugOf(req, res); if (!slug) return undefined;
    const result = await favorites.add(accountId, slug);
    if (!result) return res.status(404).json({ error: 'Tienda no encontrada', errorCode: 'MERCHANT_NOT_FOUND' });
    if (result.limitReached) return res.status(409).json({ error: 'Llegaste al maximo de tiendas favoritas', errorCode: 'FAVORITES_LIMIT' });
    return res.status(result.created ? 201 : 200).json({ slug: result.slug, favorite: true });
  }));
  router.delete('/:slug', handle(async (favorites, accountId, req, res) => {
    const slug = slugOf(req, res); if (!slug) return undefined;
    await favorites.remove(accountId, slug);
    return res.status(204).end();
  }));
  return router;
}

module.exports = createMarketplaceFavoritesV1Router;
