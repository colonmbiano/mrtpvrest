const express = require('express');
const { runSaaSAgent } = require('../services/saas-assistant.service');
const { authenticate, requireSuperAdmin } = require('../middleware/auth.middleware');
const router = express.Router();

// Todas las rutas de este archivo requieren ser Super Admin
router.use(authenticate, requireSuperAdmin);

/**
 * POST /api/saas-ai/agent
 * Chat con el Agente de Inteligencia del SaaS
 */
router.post('/agent', async (req, res) => {
  try {
    const { messages } = req.body || {};
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Se requiere un arreglo de mensajes' });
    }

    const result = await runSaaSAgent({ messages });
    res.json(result);
  } catch (error) {
    console.error('Error en SaaS AI Agent Route:', error.message);
    res.status(500).json({ error: error.message || 'Error interno al procesar la solicitud de IA' });
  }
});

module.exports = router;
