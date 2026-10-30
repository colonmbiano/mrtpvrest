'use strict';

const { SettlementsV1Error, createSettlementsV1Service } = require('../lib/marketplace-settlements-v1');
const { StaffIdentityError, createStaffActorResolver } = require('../lib/marketplace-staff-identity');

function createMarketplaceSettlementsV1Router({ Router, service, resolveActor, staffOptions,
  prisma, env = process.env, getGateway, publish } = {}) {
  const router = (Router || require('express').Router)();
  const actorFor = resolveActor || createStaffActorResolver(staffOptions);
  let defaultService;
  const settlements = () => {
    if (service) return service;
    if (defaultService) return defaultService;
    if (env.MARKETPLACE_FINANCE_ENABLED !== 'true') return (defaultService = createSettlementsV1Service());
    const { createMarketplaceSettlementsPrisma } = require('../lib/marketplace-settlements-prisma');
    return (defaultService = createMarketplaceSettlementsPrisma({
      prisma: prisma || require('@mrtpvrest/database').prisma, env, ...(getGateway ? { getGateway } : {}),
    }));
  };
  // Every route shares one error mapping. Internal details are never returned.
  function respond(res, error) {
    if (error instanceof SettlementsV1Error || error instanceof StaffIdentityError) return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
    return res.status(503).json({ error: 'Liquidaciones temporalmente no disponibles', errorCode: 'SETTLEMENTS_UNAVAILABLE' });
  }

  router.get('/merchant/settlements', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const actor = (await actorFor(req)) ?? null;
      return res.status(200).json(await settlements().listMerchantSettlements(actor, req.query));
    } catch (error) {
      return respond(res, error);
    }
  });

  router.post('/ops/orders/:id/refund', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const actor = (await actorFor(req)) ?? null;
      const result = await settlements().refundOrder(actor, req.params.id, req.headers?.['idempotency-key'], req.body);
      // 201 for a new refund, 200 for an idempotent replay of an earlier one.
      return res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      return respond(res, error);
    }
  });

  // Conciliación explícita: registra la obligación contable, no confirma una
  // transferencia bancaria inexistente. Ningún cron se activa al montar la ruta.
  router.post('/ops/orders/:id/settle', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const actor = (await actorFor(req)) ?? null;
      const current = settlements();
      if (!current.reconcileOrder) throw new SettlementsV1Error('SETTLEMENTS_UNAVAILABLE', 'Liquidaciones no habilitadas', 503);
      return res.json(await current.reconcileOrder(actor, req.params.id));
    } catch (error) { return respond(res, error); }
  });
  router.post('/ops/finance/recover', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const body = req.body ?? {};
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'limit')) {
        throw new SettlementsV1Error('INVALID_REQUEST', 'Parametros invalidos', 400);
      }
      const actor = (await actorFor(req)) ?? null;
      const current = settlements();
      if (!current.recoverRefunds) throw new SettlementsV1Error('SETTLEMENTS_UNAVAILABLE', 'Liquidaciones no habilitadas', 503);
      const refunds = await current.recoverRefunds(actor, body);
      const events = publish ? await current.drainOutbox({ publish, limit: body.limit ?? 25 }) : null;
      return res.json({ refunds: refunds.items, events, publisherConfigured: Boolean(publish) });
    } catch (error) { return respond(res, error); }
  });

  return router;
}

module.exports = createMarketplaceSettlementsV1Router;
