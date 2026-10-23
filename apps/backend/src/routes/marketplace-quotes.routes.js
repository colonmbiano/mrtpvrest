'use strict';

const { MarketplaceQuoteError, createQuoteService } = require('../lib/marketplace-quote');

// Marketplace customer identity (MarketplaceAccount) is not implemented yet. Until an
// adapter exists every request is anonymous and rejected with 401. The staff session
// is never reused here.
const noAccount = () => null;

function createMarketplaceQuotesRouter({ Router, service, resolveAccount = noAccount } = {}) {
  const router = (Router || require('express').Router)();
  let defaultService;
  // Mounted at /api/marketplace/v1/quotes.
  router.post('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const accountId = await resolveAccount(req);
      const quotes = service || (defaultService ||= createQuoteService());
      const quote = await quotes.createQuote({ accountId: accountId ?? undefined,
        idempotencyKey: req.headers?.['idempotency-key'], body: req.body });
      return res.status(201).json(quote);
    } catch (error) {
      if (error instanceof MarketplaceQuoteError) {
        return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
      }
      return res.status(503).json({ error: 'Cotizaciones temporalmente no disponibles', errorCode: 'QUOTES_UNAVAILABLE' });
    }
  });
  return router;
}

module.exports = createMarketplaceQuotesRouter;
