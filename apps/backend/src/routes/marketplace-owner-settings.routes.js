'use strict';
const { MarketplaceSettingsError, getOwnerSettings, saveOwnerSettings } = require('../lib/marketplace-owner-settings');

// Mounted after authenticate + requireSuperAdmin in /api/saas.
module.exports = function createOwnerSettingsRouter({ prisma, runWithBypass, Router = require('express').Router } = {}) {
  const router = Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.user?.role !== 'SUPER_ADMIN' || req.user.isActive !== true || req.user.isDevice || !req.user.id) {
      return res.status(403).json({ error: 'Acceso restringido a SuperAdmin' });
    }
    next();
  });
  const handle = action => async (req, res) => {
    try { res.json(await runWithBypass(() => action(req))); }
    catch (error) {
      if (error instanceof MarketplaceSettingsError) return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
      return res.status(503).json({ error: 'No se pudo guardar o cargar la configuración', errorCode: 'SETTINGS_UNAVAILABLE' });
    }
  };
  router.get('/', handle(() => getOwnerSettings(prisma)));
  router.patch('/', handle(req => saveOwnerSettings(prisma, req.body, req.user.id)));
  return router;
};
