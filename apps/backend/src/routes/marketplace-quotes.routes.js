'use strict';

const { MarketplaceQuoteError, createQuoteService } = require('../lib/marketplace-quote');
const { BuyerIdentityError, createBuyerAccountResolver } = require('../lib/marketplace-buyer-identity');
const { defaultMarketplaceV1Services } = require('../lib/marketplace-v1-prisma');

function createMarketplaceQuotesRouter({ Router, service, resolveAccount, buyerOptions } = {}) {
  const router = (Router || require('express').Router)();
  const accountFor = resolveAccount || createBuyerAccountResolver({ ...buyerOptions, allowGuest: true });
  let defaultService;
  // Mounted at /api/marketplace/v1/quotes.
  router.post('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const accountId = await accountFor(req);
      // Sin MARKETPLACE_V1_ORDERS_ENABLED el servicio no tiene adaptadores y responde 503.
      const quotes = service || (defaultService ||= defaultMarketplaceV1Services()?.quoteService || createQuoteService());
      const quote = await quotes.createQuote({ accountId: accountId ?? undefined,
        idempotencyKey: req.headers?.['idempotency-key'], body: req.body });
      return res.status(201).json(quote);
    } catch (error) {
      if (error instanceof MarketplaceQuoteError || error instanceof BuyerIdentityError) {
        return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
      }
      return res.status(503).json({ error: 'Cotizaciones temporalmente no disponibles', errorCode: 'QUOTES_UNAVAILABLE' });
    }
  });
  return router;
}

module.exports = createMarketplaceQuotesRouter;
