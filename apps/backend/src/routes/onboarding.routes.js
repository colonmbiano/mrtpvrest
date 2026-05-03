// ─────────────────────────────────────────────────────────────────────────────
// onboarding.routes.js — Chat conversacional de onboarding con IA
// POST /api/onboarding/chat
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router()
const OpenAI = require('openai')
const { GROQ_BASE_URL, GROQ_MODEL, wrapGroqError } = require('../services/groq-error')
const prisma = require('@mrtpvrest/database').prisma
const { authenticate, requireTenantAccess } = require('../middleware/auth.middleware')

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

// -- Sanitización de campos persistidos (vienen de la IA, no se confía en ellos)
function sanitizeText(raw, maxLen) {
  if (typeof raw !== 'string') return null
  // strip control chars, collapse whitespace, trim, cap length
  const clean = raw.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim()
  if (!clean) return null
  return clean.slice(0, maxLen)
}

function sanitizePhone(raw) {
  if (typeof raw !== 'string') return null
  // permite +, dígitos, espacios, guiones, paréntesis; max 20 chars
  const clean = raw.replace(/[^\d+\-\s()]/g, '').trim()
  return clean ? clean.slice(0, 20) : null
}

// ── POST /api/onboarding/chat ────────────────────────────────────────────────

router.post('/chat', async (req, res) => {
  const { message, history = [] } = req.body

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'El campo "message" es requerido' })
  }

  // Bloquear re-ejecución del onboarding una vez completado.
  // El frontend redirige al admin si isOnboarded, pero un token válido + curl
  // podría sobrescribir name/businessType/activeModules sin esta defensa.
  const tenantId = req.user.tenantId
  if (tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { isOnboarded: true },
    })
    if (tenant?.isOnboarded) {
      return res.status(409).json({ error: 'El onboarding ya fue completado para este negocio.' })
    }
  }

  // El onboarding es un flujo de plataforma: siempre usa la key de plataforma.
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    console.error('GROQ_API_KEY no está configurada en el servidor')
    return res.status(503).json({ error: 'El servicio de IA no está disponible en este momento. Contacta soporte.' })
  }

  let aiJson
  try {
    const groq = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });

    const chatMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.map(h => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: h.content
      })),
      { role: 'user', content: message }
    ];

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: chatMessages,
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: 'json_object' }
    });

    const rawText = completion.choices[0]?.message?.content || '{}';

    try {
      aiJson = JSON.parse(rawText)
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('La IA no devolvió JSON válido')
      aiJson = JSON.parse(match[0])
    }
  } catch (err) {
    console.error('Error llamando Groq API (onboarding):', err.message)
    const wrapped = wrapGroqError(err);
    return res.status(wrapped.status || 502).json({ error: wrapped.message })
  }

  // ── Persistir cuando el onboarding está completo ──────────────────────────
  if (aiJson.currentStep === 'done' && aiJson.readyToConfirm === true) {
    const restaurantId = req.user.restaurantId

    if (tenantId) {
      try {
        const bd      = aiJson.businessData ?? {}
        const modules = Array.isArray(aiJson.activatedModules) ? aiJson.activatedModules : []
        if (!modules.includes('pos_standard')) modules.unshift('pos_standard')

        // Sanitizar campos antes de persistir (vienen de la IA, no son confiables)
        const safeName    = sanitizeText(bd.name, 120)
        const safeAddress = sanitizeText(bd.address, 240)
        const safePhone   = sanitizePhone(bd.phone)
        const safeType    = bd.businessType ? normalizeBusinessType(bd.businessType) : null

        const tenantUpdate = {
          isOnboarded:   true,
          onboardingDone: true,
          activeModules: modules,
        }
        if (safeName) tenantUpdate.name         = safeName
        if (safeType) tenantUpdate.businessType = safeType

        await prisma.tenant.update({ where: { id: tenantId }, data: tenantUpdate })

        if (restaurantId && (safePhone || safeAddress)) {
          const cfgFields = {
            ...(safePhone   && { phone:   safePhone }),
            ...(safeAddress && { address: safeAddress }),
          }
          await prisma.restaurantConfig.upsert({
            where:  { restaurantId },
            update: cfgFields,
            create: { restaurantId, ...cfgFields },
          })
        }

        if (restaurantId && Array.isArray(aiJson.suggestedCategories)) {
          for (let i = 0; i < aiJson.suggestedCategories.length; i++) {
            const name = sanitizeText(aiJson.suggestedCategories[i], 60)
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
