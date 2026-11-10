'use strict';

const { SettlementsV1Error, createSettlementsV1Service } = require('../lib/marketplace-settlements-v1');
const { StaffIdentityError, createStaffActorResolver } = require('../lib/marketplace-staff-identity');
const { CommissionError, createCommissionStatements } = require('../lib/marketplace-commissions');
const { CourierPayoutError, createCourierPayouts } = require('../lib/marketplace-courier-payouts');

function createMarketplaceSettlementsV1Router({ Router, service, resolveActor, staffOptions,
  prisma, env = process.env, getGateway, publish, commissionService, payoutService } = {}) {
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
  // C5: comisiones de pedidos en efectivo. No dependen de Mercado Pago, así que no esperan a
  // MARKETPLACE_FINANCE_ENABLED.
  let defaultCommissions;
  const commissions = () => commissionService
    || (defaultCommissions ||= createCommissionStatements({ prisma: prisma || require('@mrtpvrest/database').prisma }));
  // Every route shares one error mapping. Internal details are never returned.
  function respond(res, error) {
    if (error instanceof SettlementsV1Error || error instanceof StaffIdentityError || error instanceof CommissionError
      || error instanceof CourierPayoutError) return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
    if (['P2002', 'P2034', 'P2028'].includes(error?.code)) return res.status(409).json({ error: 'El recurso cambió; actualiza la vista', errorCode: 'SETTLEMENTS_CONFLICT' });
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

  // ── C5: estado de cuenta mensual de comisiones (efectivo) ──
  function commissionRoute(run) {
    return async (req, res) => {
      res.set('Cache-Control', 'no-store');
      try {
        const actor = (await actorFor(req)) ?? null;
        return res.json(await run(commissions(), actor, req));
      } catch (error) { return respond(res, error); }
    };
  }
  router.get('/merchant/commissions', commissionRoute((svc, actor, req) => svc.merchantStatements(actor, req.query ?? {})));
  router.get('/ops/commissions', commissionRoute((svc, actor, req) => svc.listPeriod(actor, req.query ?? {})));
  router.get('/ops/commissions/:restaurantId', commissionRoute((svc, actor, req) => svc.merchantDetail(actor, req.params.restaurantId, req.query ?? {})));
  router.post('/ops/commissions/:restaurantId/issue', commissionRoute((svc, actor, req) => svc.issue(actor, req.params.restaurantId, req.body ?? {})));
  router.post('/ops/commissions/:restaurantId/pay', commissionRoute((svc, actor, req) => svc.markPaid(actor, req.params.restaurantId, req.body ?? {})));

  // ── C8: cortes diarios del repartidor independiente ──
  let defaultPayouts;
  const payouts = () => payoutService
    || (defaultPayouts ||= createCourierPayouts({ prisma: prisma || require('@mrtpvrest/database').prisma }));
  function payoutRoute(run) {
    return async (req, res) => {
      res.set('Cache-Control', 'no-store');
      try {
        const actor = (await actorFor(req)) ?? null;
        return res.json(await run(payouts(), actor, req));
      } catch (error) { return respond(res, error); }
    };
  }
  router.get('/merchant/courier-payouts', payoutRoute((svc, actor, req) => svc.merchantDay(actor, req.query ?? {})));
  router.post('/merchant/courier-payouts/:id/pay', payoutRoute((svc, actor, req) => svc.markPaid(actor, req.params.id, req.body ?? {})));
  // Plataforma: emitir a mano un día ya terminado (el job lo hace cada madrugada).
  router.post('/ops/courier-payouts/issue', payoutRoute(async (svc, actor, req) => {
    if (!actor || !Array.isArray(actor.roles) || !actor.roles.includes('SUPER_ADMIN')) {
      throw new CourierPayoutError('PAYOUTS_FORBIDDEN', 'Solo la plataforma emite cortes a mano', 403);
    }
    const body = req.body ?? {};
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'date')) {
      throw new CourierPayoutError('INVALID_REQUEST', 'Parámetros inválidos', 400);
    }
    return svc.issueDay({ date: body.date, issuedBy: actor.accountId });
  }));

  return router;
}

module.exports = createMarketplaceSettlementsV1Router;
