'use strict';

const { BuyerAddressError } = require('../lib/marketplace-buyer-addresses');
const { BuyerIdentityError, createBuyerAccountResolver } = require('../lib/marketplace-buyer-identity');
const { defaultMarketplaceV1Services } = require('../lib/marketplace-v1-prisma');

function createMarketplaceAddressesV1Router({ Router, service, resolveAccount, buyerOptions } = {}) {
  const router = (Router || require('express').Router)();
  // Misma identidad que la orden (Bearer o X-Buyer-Id): la orden debe poder leer
  // la dirección. Sin cabecera no hay huella de invitado: 401.
  const accountFor = resolveAccount || createBuyerAccountResolver({ ...buyerOptions, allowGuest: false });
  let defaultService;
  const handle = action => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Vary', 'Authorization, X-Buyer-Id');
    try {
      const accountId = await accountFor(req);
      if (!accountId) return res.status(401).json({ error: 'Identidad de comprador requerida', errorCode: 'UNAUTHENTICATED' });
      // Sin MARKETPLACE_V1_ORDERS_ENABLED no hay libreta: 503.
      const book = service || (defaultService ||= defaultMarketplaceV1Services()?.addressBook || null);
      if (!book) return res.status(503).json({ error: 'Direcciones no disponibles', errorCode: 'ADDRESSES_UNAVAILABLE' });
      return await action(book, accountId, req, res);
    } catch (error) {
      if (error instanceof BuyerAddressError || error instanceof BuyerIdentityError) {
        return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
      }
      return res.status(503).json({ error: 'Direcciones temporalmente no disponibles', errorCode: 'ADDRESSES_UNAVAILABLE' });
    }
  };
  // Mounted at /api/marketplace/v1/addresses.
  router.get('/', handle(async (book, accountId, req, res) => res.json({ addresses: await book.list(accountId) })));
  router.post('/', handle(async (book, accountId, req, res) => {
    const { address, created } = await book.save(accountId, req.body);
    return res.status(created ? 201 : 200).json(address);
  }));
  router.delete('/:id', handle(async (book, accountId, req, res) => {
    await book.remove(accountId, req.params.id);
    return res.status(204).end();
  }));
  return router;
}

module.exports = createMarketplaceAddressesV1Router;
