// ─────────────────────────────────────────────────────────────────────────────
// onboarding.routes.js — Chat conversacional de onboarding con IA
// POST /api/onboarding/chat
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router()
const axios  = require('axios')
const prisma = require('@mrtpvrest/database').prisma
const { authenticate, requireTenantAccess } = require('../middleware/auth.middleware')

// Nota: usamos axios directo a la Anthropic API porque @anthropic-ai/sdk
// no está instalado. El SDK openai@6 que sí está instalado es para OpenAI,
// no compatible sin adaptador.

router.use(authenticate, requireTenantAccess)

// ── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres el asistente de configuración de MRTPVREST, un sistema POS para restaurantes y negocios de alimentos en LATAM.

Tu trabajo es conversar naturalmente en español para configurar el negocio del usuario. Debes recopilar:
1. Nombre del negocio
2. Tipo de negocio (restaurante, abarrotes, carnicería, pollería, otro)
3. Teléfono y dirección
4. Qué módulos necesita según su descripción:
   - pos_standard: siempre activo
   - kds: si tiene cocina o preparación
   - delivery: si hace entregas a domicilio
   - inventory: si maneja ingredientes o stock
   - employee_management: si tiene empleados
   - cash_shift: si maneja turnos de caja
   - client_menu: si quiere tienda online
5. Categorías iniciales del menú (3-6 sugeridas según el tipo de negocio)

REGLAS:
- Conversa de forma natural, una o dos preguntas a la vez
- Deduce módulos de lo que el usuario describe, no preguntes directamente por ellos
- Cuando tengas suficiente información, confirma con el usuario antes de finalizar
- SIEMPRE responde ÚNICAMENTE con JSON válido, sin texto extra:

{
  "message": "texto para mostrar al usuario",
  "businessData": {
    "name": null,
    "businessType": null,
    "phone": null,
    "address": null
  },
  "activatedModules": [],
  "suggestedCategories": [],
  "currentStep": "greeting|collecting|confirming|done",
  "readyToConfirm": false
}

Ejemplos:
- Usuario dice "tenemos repartidores" → activa delivery
- Usuario dice "manejamos ingredientes frescos" → activa inventory
- Usuario dice "somos 5 en el equipo" → activa employee_management
- Usuario dice "queremos cobrar por turnos" → activa cash_shift`

// ── Mapa businessType: texto libre → valor Prisma ────────────────────────────

const BUSINESS_TYPE_MAP = {
  restaurante: 'RESTAURANT',
  restaurant:  'RESTAURANT',
  abarrotes:   'GROCERY',
  grocery:     'GROCERY',
  carniceria:  'BUTCHER',
  carnicería:  'BUTCHER',
  butcher:     'BUTCHER',
  polleria:    'POULTRY',
  pollería:    'POULTRY',
  poultry:     'POULTRY',
}
const VALID_BUSINESS_TYPES = ['RESTAURANT', 'GROCERY', 'BUTCHER', 'POULTRY', 'OTHER']

function normalizeBusinessType(raw) {
  if (!raw) return null
  const upper = raw.toUpperCase()
  if (VALID_BUSINESS_TYPES.includes(upper)) return upper
  const lower = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return BUSINESS_TYPE_MAP[lower] ?? 'OTHER'
}

// ── POST /api/onboarding/chat ────────────────────────────────────────────────

router.post('/chat', async (req, res) => {
  const { message, history = [] } = req.body

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'El campo "message" es requerido' })
  }

  let apiKey
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId
    ;({ apiKey } = await require('../services/ai-key.service').resolveAiKey({ restaurantId }))
  } catch (err) {
    if (err.code === 'AI_KEY_REQUIRED') {
      return res.status(402).json({ error: err.message, code: 'AI_KEY_REQUIRED', action: 'configure_ai_key' })
    }
    if (err.code === 'AI_KEY_CORRUPTED') {
      return res.status(409).json({ error: err.message, code: 'AI_KEY_CORRUPTED' })
    }
    return res.status(500).json({ error: err.message || 'No se pudo resolver la API key' })
  }

  let aiJson
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        contents: [
          ...history.map(h => ({
            role:  h.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: h.content }]
          })),
          { role: 'user', parts: [{ text: message }] }
        ],
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        generationConfig: {
          temperature:      0.7,
          maxOutputTokens:  1000,
        }
      },
      { timeout: 30000 }
    )

    const rawText = response.data.candidates[0].content.parts[0].text

    try {
      aiJson = JSON.parse(rawText)
    } catch {
      // Si la IA no devolvió JSON puro, intentamos extraerlo
      const match = rawText.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('La IA no devolvió JSON válido')
      aiJson = JSON.parse(match[0])
    }
  } catch (err) {
    console.error('Error llamando Anthropic API:', err?.response?.data ?? err.message)
    return res.status(502).json({ error: 'Error al contactar la IA. Intenta de nuevo.' })
  }

  // ── Persistir cuando el onboarding está completo ──────────────────────────
  if (aiJson.currentStep === 'done' && aiJson.readyToConfirm === true) {
    const tenantId     = req.user.tenantId
    const restaurantId = req.user.restaurantId

    if (tenantId) {
      try {
        const bd      = aiJson.businessData ?? {}
        const modules = Array.isArray(aiJson.activatedModules) ? aiJson.activatedModules : []
        // pos_standard siempre presente
        if (!modules.includes('pos_standard')) modules.unshift('pos_standard')

        // 1. Actualizar Tenant (incluyendo activeModules)
        const tenantUpdate = {
          isOnboarded:   true,
          onboardingDone: true,
          activeModules: modules,
        }
        if (bd.name)         tenantUpdate.name         = bd.name
        if (bd.businessType) tenantUpdate.businessType = normalizeBusinessType(bd.businessType)

        await prisma.tenant.update({ where: { id: tenantId }, data: tenantUpdate })

        // 2. Actualizar RestaurantConfig si hay restaurante asociado
        if (restaurantId && (bd.phone || bd.address)) {
          await prisma.restaurantConfig.upsert({
            where:  { restaurantId },
            update: {
              ...(bd.phone   && { phone:   bd.phone }),
              ...(bd.address && { address: bd.address }),
            },
            create: {
              restaurantId,
              ...(bd.phone   && { phone:   bd.phone }),
              ...(bd.address && { address: bd.address }),
            },
          })
        }

        // 3. Crear categorías sugeridas en el restaurante
        if (restaurantId && Array.isArray(aiJson.suggestedCategories)) {
          for (let i = 0; i < aiJson.suggestedCategories.length; i++) {
            const name = String(aiJson.suggestedCategories[i]).trim()
            if (!name) continue
            await prisma.category.upsert({
              where:  { restaurantId_name: { restaurantId, name } },
              update: { sortOrder: i },
              create: { restaurantId, name, sortOrder: i, isActive: true },
            })
          }
        }

        console.log(`✅ Onboarding completado — tenant: ${tenantId}, módulos: ${modules.join(', ')}`)
      } catch (dbErr) {
        console.error('Error persistiendo onboarding:', dbErr)
        aiJson.message += '\n\n⚠️ Hubo un error guardando la configuración. Contacta soporte si el problema persiste.'
      }
    }
  }

  res.json(aiJson)
})

module.exports = router
