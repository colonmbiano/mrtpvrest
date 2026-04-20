const express = require('express');
const { scanMenuFromImages, scanInventoryFromImages } = require('../services/ai.service');
const { runAssistant } = require('../services/assistant.service');
const { resolveAiKey } = require('../services/ai-key.service');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const router = express.Router();
const multer = require('multer');

// Mapea errores de resolveAiKey / assistant service a códigos HTTP consistentes.
function sendAiError(res, error, fallback = 500) {
  if (error?.code === 'AI_KEY_REQUIRED') {
    return res.status(402).json({
      error: error.message,
      code: 'AI_KEY_REQUIRED',
      action: 'configure_ai_key',
    });
  }
  if (error?.code === 'AI_KEY_CORRUPTED') {
    return res.status(409).json({ error: error.message, code: 'AI_KEY_CORRUPTED' });
  }
  if (error?.code === 'BAD_REQUEST') return res.status(400).json({ error: error.message });
  if (error?.code === 'NOT_FOUND') return res.status(404).json({ error: error.message });
  if (error?.code === 'RATE_LIMIT') return res.status(429).json({ error: error.message });
  return res.status(fallback).json({ error: error?.message || 'Error interno' });
}

// Configuramos Multer para aceptar múltiples archivos (hasta 10)
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB por imagen
});

// Escanear MENÚ (Platos y Precios)
router.post('/scan-menu', authenticate, requireAdmin, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No se recibieron imágenes.' });
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const { apiKey } = await resolveAiKey({ restaurantId });
    console.log(`🤖 Iniciando escaneo de ${req.files.length} imágenes de MENÚ con IA...`);
    const base64Images = req.files.map(file => file.buffer.toString('base64'));
    const menuData = await scanMenuFromImages(base64Images, apiKey);
    res.json({ message: 'Menú analizado con éxito', data: menuData });
  } catch (error) {
    if (error?.code) return sendAiError(res, error);
    console.error('Error en AI Menu Route:', error.message);
    res.status(500).json({ error: 'Hubo un problema al procesar las imágenes con IA.' });
  }
});

// Escanear INVENTARIO (Facturas y Listas de Stock)
router.post('/scan-inventory', authenticate, requireAdmin, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No se recibieron imágenes.' });
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const { apiKey } = await resolveAiKey({ restaurantId });
    console.log(`🤖 Iniciando escaneo de ${req.files.length} imágenes de INVENTARIO con IA...`);
    const base64Images = req.files.map(file => file.buffer.toString('base64'));
    const inventoryData = await scanInventoryFromImages(base64Images, apiKey);
    res.json({ message: 'Inventario analizado con éxito', data: inventoryData });
  } catch (error) {
    if (error?.code) return sendAiError(res, error);
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
    if (error?.code) return sendAiError(res, error);
    console.error('Error en AI Assistant Route:', error);
    res.status(500).json({ error: 'Hubo un problema al procesar la solicitud.' });
  }
});

module.exports = router;
