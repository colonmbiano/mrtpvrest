const express = require('express');
const { scanMenuFromImages, scanInventoryFromImages, parseInventoryFile, isSpreadsheet, generateRecipeForId } = require('../services/ai.service');
const { runAssistant } = require('../services/assistant.service');
const { runVoiceAgent } = require('../services/voice-agent.service');
const { runOrderDictationSmart } = require('../services/order-dictation.service');
const { resolveGeminiKey } = require('../services/ai-key.service');
const { authenticate, requireAdmin, requireRole, requireTenantAccess } = require('../middleware/auth.middleware');

// Roles que pueden escanear tickets de compra (mismos que registran compras
// desde el TPV). El escaneo de inventario alimenta el flujo de Compras, así
// que no debe quedar restringido sólo a ADMIN.
const PURCHASE_SCAN_ROLES = ['CASHIER', 'WAITER', 'KITCHEN', 'ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'];
const { aiLimiter, aiTenantLimiter } = require('../lib/rate-limiters');
const router = express.Router();
const multer = require('multer');

// Rate limit aplica a todas las rutas IA (vision + chat + agent). 30/min/IP.
// Va antes de authenticate para no gastar verificación de JWT en abusadores.
router.use(aiLimiter);

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
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (allowed.includes(file.mimetype) || name.endsWith('.xlsx') || name.endsWith('.csv')) cb(null, true);
    else cb(new Error('Tipo de archivo no permitido'));
  },
});

// Escanear MENÚ (Platos y Precios) — visión, usa Gemini con key de plataforma.
router.post('/scan-menu', authenticate, requireTenantAccess, aiTenantLimiter, requireAdmin, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No se recibieron imágenes.' });
    const { apiKey } = resolveGeminiKey();
    console.log(`🤖 Iniciando escaneo de ${req.files.length} imágenes de MENÚ con IA (Gemini Vision)...`);
    const imageParts = req.files.map(file => ({
      data: file.buffer.toString('base64'),
      mimeType: file.mimetype
    }));
    const menuData = await scanMenuFromImages(imageParts, apiKey);
    res.json({ message: 'Menú analizado con éxito', data: menuData });
  } catch (error) {
    if (error?.code) return sendAiError(res, error);
    console.error('Error en AI Menu Route:', error);
    res.status(500).json({ error: error?.message || 'Hubo un problema al procesar las imágenes con IA.' });
  }
});

// Escanear INVENTARIO (Facturas y Listas de Stock) — híbrido: parseo directo
// para Excel/CSV (0 tokens), Gemini Vision para imágenes y PDFs.
//
// Reglas de decisión:
//   · TODOS los archivos son spreadsheet → parseInventoryFile por cada uno,
//     resultados concatenados. Si subes 2 hojas, las dos se procesan.
//   · CUALQUIER otro caso (imágenes/PDFs/mix) → Gemini Vision con mimeType
//     correcto por archivo. PDFs van con application/pdf (Gemini lo soporta
//     nativamente desde 1.5). Imágenes van con su mimeType original (no
//     hardcodear image/jpeg porque rompe PNGs en algunas regiones).
router.post('/scan-inventory', authenticate, requireTenantAccess, aiTenantLimiter, requireRole(...PURCHASE_SCAN_ROLES), upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No se recibieron archivos.' });

    // Decisión #3: mirar TODOS los archivos, no solo el primero.
    const allSpreadsheet = req.files.every(isSpreadsheet);

    if (allSpreadsheet) {
      console.log(`📊 Importación DIRECTA de ${req.files.length} archivo(s) de inventario...`);
      const ingredients = [];
      for (const file of req.files) {
        const parsed = await parseInventoryFile(file);
        if (Array.isArray(parsed?.ingredients)) ingredients.push(...parsed.ingredients);
      }
      return res.json({ message: 'Archivo(s) procesado(s) con éxito', data: { ingredients }, source: 'direct' });
    }

    // Mix o todos imágenes/PDF → Gemini Vision. Mantener mimeType real
    // por archivo (PNG/JPEG/PDF). Gemini 1.5+ acepta application/pdf
    // como inlineData sin pre-conversión.
    const { apiKey } = resolveGeminiKey();
    console.log(`🤖 Escaneo IA de ${req.files.length} archivo(s) de INVENTARIO (Gemini Vision)...`);

    const imageParts = req.files.map((file) => ({
      data: file.buffer.toString('base64'),
      mimeType: file.mimetype || (file.originalname?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
    }));

    const inventoryData = await scanInventoryFromImages(imageParts, apiKey);
    res.json({ message: 'Inventario analizado con éxito', data: inventoryData, source: 'ai' });
  } catch (error) {
    if (error?.code) return sendAiError(res, error);
    console.error('Error en AI Inventory Route:', error);
    res.status(500).json({ error: error?.message || 'Hubo un problema al procesar el inventario.' });
  }
});

// POST /api/ai/assistant — chat con el asistente administrativo (Claude)
// Body: { messages: [{ role: "user"|"assistant", content: string|Array }] }
// Responde con { messages, usage } incluyendo la respuesta final del asistente.
router.post('/assistant', authenticate, requireTenantAccess, aiTenantLimiter, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const locationId = req.headers['x-location-id'] || req.query.locationId || null;

    const { messages, period } = req.body || {};
    const result = await runAssistant({ messages, restaurantId, locationId, period });
    res.json(result);
  } catch (error) {
    if (error?.code) return sendAiError(res, error);
    console.error('Error en AI Assistant Route:', error);
    res.status(500).json({ error: 'Hubo un problema al procesar la solicitud.' });
  }
});

// POST /api/ai/order-dictation
// Dictado operativo del TPV: convierte el texto reconocido por voz en productos
// reales del menu y arma un borrador para que el cajero confirme en el ticket.
// Motor híbrido (runOrderDictationSmart): si el restaurante registró su propia
// Groq key (BYOK) usa IA (Llama) para entender lenguaje natural y varios
// productos; si no, cae al parser de reglas gratis. Nunca expone precios del
// cliente a terceros más allá de los nombres del menú.
router.post('/order-dictation', authenticate, requireTenantAccess, aiTenantLimiter, requireRole('CASHIER', 'WAITER', 'MANAGER', 'ADMIN', 'OWNER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const { prompt } = req.body || {};
    if (!prompt?.trim()) return res.status(400).json({ error: 'prompt requerido' });

    // Modelo grande (70b): acierta mucho mejor el matching contra el menú que el
    // 8b. La latencia extra es mínima (Groq es rápido) y vale la precisión.
    const result = await runOrderDictationSmart({
      prompt,
      restaurantId,
      model: process.env.ORDER_PARSE_MODEL || 'llama-3.3-70b-versatile',
    });
    res.json(result);
  } catch (error) {
    if (error?.code) return sendAiError(res, error);
    console.error('Error en Order Dictation Route:', error.message);
    res.status(500).json({ error: 'Hubo un problema al interpretar el pedido dictado.' });
  }
});

// POST /api/ai/agent — FASE 5: agente de voz del TPV (Anthropic + tool_use).
// Body: { prompt: string }
// El tenantId se toma del JWT (NUNCA del body) para evitar IDOR. Si el body
// incluye tenantId y no coincide, responde 403.
// Responde con { ok, action, message, data? } para que el frontend muestre un
// toast y refresque la vista afectada si aplica.
router.post('/agent', authenticate, requireTenantAccess, aiTenantLimiter, async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(403).json({ error: 'Tenant no resoluble' });

    const { prompt, tenantId: bodyTenantId } = req.body || {};
    if (bodyTenantId && bodyTenantId !== tenantId) {
      return res.status(403).json({ error: 'tenantId del body no coincide con la sesión' });
    }
    if (!prompt?.trim()) return res.status(400).json({ error: 'prompt requerido' });

    const locationId = req.headers['x-location-id'] || req.locationId || null;

    const result = await runVoiceAgent({ prompt, tenantId, locationId });
    res.json(result);
  } catch (error) {
    if (error?.code) return sendAiError(res, error);
    console.error('Error en AI Agent Route:', error.message);
    res.status(500).json({ error: 'Hubo un problema al procesar la instrucción de voz.' });
  }
});

// POST /api/ai/generate-recipe — Autogenera receta para un platillo
router.post('/generate-recipe', authenticate, requireTenantAccess, aiTenantLimiter, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    
    const { menuItemId } = req.body;
    if (!menuItemId) return res.status(400).json({ error: 'menuItemId requerido' });

    const { apiKey } = resolveGeminiKey();

    const recipe = await generateRecipeForId({ menuItemId, restaurantId, apiKey });
    res.status(201).json(recipe);
  } catch (error) {
    if (error?.code) return sendAiError(res, error);
    console.error('Error en generate-recipe:', error);
    res.status(500).json({ error: error.message || 'Error al generar la receta con IA' });
  }
});

module.exports = router;
