const express = require('express');
const { scanMenuFromImages, scanInventoryFromImages } = require('../services/ai.service');
const { runAssistant } = require('../services/assistant.service');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const router = express.Router();
const multer = require('multer');

// Configuramos Multer para aceptar múltiples archivos (hasta 10)
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB por imagen
});

// Escanear MENÚ (Platos y Precios)
router.post('/scan-menu', authenticate, requireAdmin, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No se recibieron imágenes.' });
    console.log(`🤖 Iniciando escaneo de ${req.files.length} imágenes de MENÚ con IA...`);
    const base64Images = req.files.map(file => file.buffer.toString('base64'));
    const menuData = await scanMenuFromImages(base64Images);
    res.json({ message: 'Menú analizado con éxito', data: menuData });
  } catch (error) {
    console.error('Error en AI Menu Route:', error.message);
    res.status(500).json({ error: 'Hubo un problema al procesar las imágenes con IA.' });
  }
});

// Escanear INVENTARIO (Facturas y Listas de Stock)
router.post('/scan-inventory', authenticate, requireAdmin, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No se recibieron imágenes.' });
    console.log(`🤖 Iniciando escaneo de ${req.files.length} imágenes de INVENTARIO con IA...`);
    const base64Images = req.files.map(file => file.buffer.toString('base64'));
    const inventoryData = await scanInventoryFromImages(base64Images);
    res.json({ message: 'Inventario analizado con éxito', data: inventoryData });
  } catch (error) {
    console.error('Error en AI Inventory Route:', error.message);
    res.status(500).json({ error: 'Hubo un problema al procesar el inventario con IA.' });
  }
});

// POST /api/ai/assistant — chat con el asistente administrativo (Claude)
// Body: { messages: [{ role: "user"|"assistant", content: string|Array }] }
// Responde con { messages, usage } incluyendo la respuesta final del asistente.
router.post('/assistant', authenticate, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const locationId = req.headers['x-location-id'] || req.query.locationId || null;

    const { messages } = req.body || {};
    const result = await runAssistant({ messages, restaurantId, locationId });
    res.json(result);
  } catch (error) {
    if (error.code === 'ASSISTANT_UNCONFIGURED') {
      return res.status(503).json({ error: 'El asistente IA no está configurado en el servidor.' });
    }
    if (error.code === 'BAD_REQUEST') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'RATE_LIMIT') {
      return res.status(429).json({ error: 'Demasiadas peticiones al asistente. Intenta en un momento.' });
    }
    console.error('Error en AI Assistant Route:', error);
    res.status(500).json({ error: 'Hubo un problema al procesar la solicitud.' });
  }
});

module.exports = router;
