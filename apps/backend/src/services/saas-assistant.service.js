/**
 * saas-assistant.service.js
 * Asistente de Inteligencia para el Super Admin del SaaS.
 * Proporciona herramientas para gestionar tenants, suscripciones y métricas globales.
 */

const crypto = require('crypto');
const OpenAI = require('openai');
const { prisma } = require('@mrtpvrest/database');
const { sendEmail } = require('../utils/mailer');
const { wrapGroqError } = require('./groq-error');
const { provisionTenant, seedSampleMenu, ProvisionError } = require('../lib/tenant-provision');

const MAX_ITERATIONS = 6;

// Convención de dominios de la plataforma (espejo del sales-bot / saas-demos).
const STOREFRONT_BASE = process.env.STOREFRONT_BASE || 'mrtpvrest.com';
const ADMIN_URL       = process.env.SAAS_ADMIN_URL || 'https://admin.mrtpvrest.com';
const storeUrlFor     = (slug) => `https://${slug}.${STOREFRONT_BASE}`;
const genTempPassword = () => crypto.randomBytes(9).toString('base64url');
const GROQ_MODEL = 'llama-3.3-70b-versatile'; 
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

const SYSTEM_PROMPT = `Eres el Agente de Inteligencia Superior de MRTPVREST (SaaS).
Tu misión es ayudar al DUEÑO DE LA PLATAFORMA (Super Admin) a gestionar el negocio.
Tienes acceso a datos globales de todos los restaurantes, suscripciones y logs del sistema.

Reglas:
- Sé extremadamente profesional y analítico.
- Usa SIEMPRE las herramientas para dar datos exactos de facturación o estado de clientes.
- Si detectas un restaurante con problemas (ej: trial vencido), sugiérelo de forma proactiva.
- Puedes realizar acciones administrativas si se te solicita:
    * Regalar días de prueba/servicio (gift_trial_days). Esto envía un email automático al cliente.
    * Crear cupones de descuento para marcas específicas (create_brand_coupon).
    * Configurar descuentos permanentes en el precio mensual (set_tenant_discount).
    * Crear cuentas DEMO para prospectos (create_demo). Si el usuario pide una demo de un giro
      concreto (ej: "créame una demo de taquería"), genera tú mismo un menú de ejemplo realista
      para ese giro y pásalo en el parámetro "menu". Al terminar, muéstrale al usuario el link de
      la tienda y las credenciales (email, contraseña y PIN del TPV) en un bloque claro y fácil de
      copiar para compartir por WhatsApp.
- Respuestas claras con markdown, tablas para listas de tenants y negritas para cifras monetarias.
`;

const tools = [
  {
    type: 'function',
    function: {
      name: 'get_global_stats',
      description: 'Obtiene estadísticas generales del SaaS: total de tenants, suscripciones activas y facturación mensual estimada.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tenants',
      description: 'Lista los últimos restaurantes registrados con su estado de suscripción y plan.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: ['integer', 'null'], default: 10 }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_tenant_details',
      description: 'Obtiene información detallada de un restaurante específico por su ID o Slug.',
      parameters: {
        type: 'object',
        properties: {
          identifier: { type: 'string', description: 'ID o Slug del restaurante' }
        },
        required: ['identifier']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'gift_trial_days',
      description: 'Regala días adicionales de prueba o servicio a un tenant específico. Envía email de notificación.',
      parameters: {
        type: 'object',
        properties: {
          tenantId: { type: 'string', description: 'ID del tenant' },
          days: { type: 'integer', description: 'Número de días a regalar (1-365)' }
        },
        required: ['tenantId', 'days']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_brand_coupon',
      description: 'Crea un cupón de descuento para un restaurante/marca específica.',
      parameters: {
        type: 'object',
        properties: {
          restaurantId: { type: 'string', description: 'ID del restaurante' },
          code: { type: 'string', description: 'Código del cupón (ej: VERANO20)' },
          discountType: { type: 'string', enum: ['PERCENTAGE', 'FIXED'] },
          value: { type: 'number', description: 'Valor del descuento' },
          description: { type: ['string', 'null'], description: 'Descripción breve' },
          expiresInDays: { type: ['integer', 'null'], description: 'Días hasta que venza el cupón' }
        },
        required: ['restaurantId', 'code', 'discountType', 'value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_demo',
      description: 'Crea una cuenta DEMO funcional (login + TPV + tienda online) para enseñarle el producto a un prospecto. Devuelve credenciales y el link de la tienda listos para compartir por WhatsApp. Si el usuario pide un giro concreto (ej: "una demo de taquería"), genera tú mismo un menú de ejemplo realista para ese giro (4-6 categorías con 3-5 platillos cada una y precios en pesos mexicanos) y pásalo en el parámetro "menu".',
      parameters: {
        type: 'object',
        properties: {
          businessName:   { type: 'string', description: 'Nombre del negocio para la demo (ej: "Tacos El Güero")' },
          businessType:   { type: ['string', 'null'], enum: ['RESTAURANT', 'GROCERY', 'BUTCHER', 'POULTRY', 'OTHER', null], description: 'Giro del negocio' },
          demoDays:       { type: ['integer', 'null'], description: 'Días que dura la demo (default 7, máx 90)' },
          enableWebStore: { type: ['boolean', 'null'], description: 'Activar tienda online (default true)' },
          menu: {
            type: ['array', 'null'],
            description: 'Menú de ejemplo. Cada elemento es una categoría con sus platillos.',
            items: {
              type: 'object',
              properties: {
                name:  { type: 'string', description: 'Nombre de la categoría (ej: "Tacos")' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name:        { type: 'string' },
                      price:       { type: 'number' },
                      description: { type: ['string', 'null'] }
                    },
                    required: ['name', 'price']
                  }
                }
              },
              required: ['name', 'items']
            }
          }
        },
        required: ['businessName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_tenant_discount',
      description: 'Configura un descuento (nuevo precio mensual) permanente para la suscripción de un tenant.',
      parameters: {
        type: 'object',
        properties: {
          tenantId: { type: 'string', description: 'ID del tenant' },
          newMonthlyPrice: { type: 'number', description: 'Nuevo precio mensual en USD' },
          reason: { type: ['string', 'null'], description: 'Razón del descuento' }
        },
        required: ['tenantId', 'newMonthlyPrice']
      }
    }
  }
];

async function execTool(name, args) {
  switch (name) {
    case 'get_global_stats':
      const [tenantsCount, subscriptions] = await Promise.all([
        prisma.tenant.count(),
        prisma.subscription.findMany({ where: { status: 'ACTIVE' }, include: { plan: true } })
      ]);
      const monthlyRevenue = subscriptions.reduce((acc, sub) => acc + (sub.plan?.price || 0), 0);
      return {
        totalTenants: tenantsCount,
        activeSubscriptions: subscriptions.length,
        estimatedMonthlyRevenue: monthlyRevenue,
        currency: 'USD'
      };

    case 'list_tenants':
      const tenants = await prisma.tenant.findMany({
        take: args.limit || 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          status: true,
          plan: true,
          ownerEmail: true
        }
      });
      return tenants;

    case 'get_tenant_details':
      return await prisma.tenant.findFirst({
        where: {
          OR: [
            { id: args.identifier },
            { slug: args.identifier }
          ]
        },
        include: {
          locations: true,
          subscription: { include: { plan: true } }
        }
      });

    case 'gift_trial_days':
      const days = Number(args.days);
      const tenantWithSub = await prisma.tenant.findUnique({
        where: { id: args.tenantId },
        include: { subscription: true }
      });
      
      if (!tenantWithSub || !tenantWithSub.subscription) return { error: 'Suscripción no encontrada' };
      const sub = tenantWithSub.subscription;

      const ms = days * 86400000;
      const now = Date.now();
      const periodBase = sub.currentPeriodEnd && new Date(sub.currentPeriodEnd).getTime() > now
        ? new Date(sub.currentPeriodEnd) : new Date();
      const newPeriodEnd = new Date(periodBase.getTime() + ms);

      const updateData = { currentPeriodEnd: newPeriodEnd };
      if (sub.status === 'TRIAL') {
        const trialBase = sub.trialEndsAt && new Date(sub.trialEndsAt).getTime() > now
          ? new Date(sub.trialEndsAt) : new Date();
        updateData.trialEndsAt = new Date(trialBase.getTime() + ms);
      } else if (['EXPIRED', 'SUSPENDED', 'PAST_DUE'].includes(sub.status)) {
        updateData.status = 'ACTIVE';
      }

      await prisma.subscription.update({
        where: { tenantId: args.tenantId },
        data: updateData
      });

      // Notificar por Email
      if (tenantWithSub.ownerEmail) {
        await sendEmail(
          tenantWithSub.ownerEmail,
          `🎁 ¡Te hemos regalado ${days} días de MRTPVREST!`,
          `<div style="font-family:sans-serif;padding:20px;border:1px solid #eee;border-radius:10px;">
            <h2 style="color:#7c3aed;">¡Buenas noticias, ${tenantWithSub.name}!</h2>
            <p>El equipo de soporte ha añadido <strong>${days} días de cortesía</strong> a tu cuenta.</p>
            <p>Tu nueva fecha de vencimiento es: <strong>${newPeriodEnd.toLocaleDateString()}</strong></p>
            <p>¡Gracias por confiar en nosotros!</p>
            <br/>
            <small>Atentamente, El Equipo de Soporte de MRTPVREST</small>
          </div>`
        ).catch(e => console.error('Email gift error:', e.message));
      }

      return { ok: true, message: `Se han regalado ${days} días y se notificó al cliente.` };

    case 'create_brand_coupon':
      const expiry = args.expiresInDays 
        ? new Date(Date.now() + args.expiresInDays * 86400000) 
        : null;
      
      const coupon = await prisma.coupon.create({
        data: {
          restaurantId: args.restaurantId,
          code: args.code.toUpperCase(),
          discountType: args.discountType,
          discountValue: Number(args.value),
          description: args.description || `Cupón creado por IA`,
          expiresAt: expiry,
          isActive: true
        }
      });
      return { ok: true, coupon };

    case 'create_demo': {
      if (!args.businessName || String(args.businessName).trim().length < 2) {
        return { error: 'Falta el nombre del negocio.' };
      }
      const trialDays = Number.isFinite(Number(args.demoDays))
        ? Math.max(1, Math.min(90, Number(args.demoDays)))
        : 7;
      const rnd = crypto.randomBytes(3).toString('hex');
      const email = `demo-${rnd}@demo.${STOREFRONT_BASE}`;
      const tempPassword = genTempPassword();

      try {
        const result = await provisionTenant({
          restaurantName: String(args.businessName).trim(),
          ownerName: String(args.businessName).trim(),
          email,
          password: tempPassword,
          enableWebStore: args.enableWebStore !== false,
          isDemo: true,
          businessType: args.businessType || null,
          trialDaysOverride: trialDays,
        });

        // Menú de ejemplo (el que generó el modelo). Un fallo aquí no tumba la demo.
        let seeded = { categories: 0, items: 0 };
        if (Array.isArray(args.menu) && args.menu.length > 0) {
          try {
            seeded = await seedSampleMenu(result.restaurant.id, args.menu);
          } catch (e) {
            console.error('create_demo seed error:', e.message);
          }
        }

        return {
          ok: true,
          business: result.tenant.name,
          storeUrl: storeUrlFor(result.tenant.slug),
          adminUrl: ADMIN_URL,
          credentials: { email: result.user.email, password: tempPassword, tpvPin: '1234' },
          menu: seeded,
          demoDays: trialDays,
        };
      } catch (e) {
        if (e instanceof ProvisionError) return { error: e.message, code: e.code };
        console.error('create_demo error:', e.message);
        return { error: 'No se pudo crear la demo.' };
      }
    }

    case 'set_tenant_discount':
      const updatedSub = await prisma.subscription.update({
        where: { tenantId: args.tenantId },
        data: { priceSnapshot: Number(args.newMonthlyPrice) }
      });
      
      // Registrar log de auditoría
      await prisma.saasLog.create({
        data: {
          tenantId: args.tenantId,
          level: 'OK',
          message: `Descuento aplicado por IA: Nuevo precio $${args.newMonthlyPrice}. Razón: ${args.reason || 'No especificada'}`
        }
      }).catch(() => {});

      return { ok: true, newPrice: updatedSub.priceSnapshot };

    default:
      return { error: 'Herramienta no implementada' };
  }
}

async function runSaaSAgent({ messages }) {
  // El asistente SaaS es Groq-only (OpenAI SDK). NO hacer fallback a
  // GOOGLE_AI_API_KEY: no hay path que traduzca estas tools al formato de
  // Gemini, y mandar la key de Google al endpoint de Groq produce un 401
  // opaco. Si falta la key de Groq, degradar a un 503 claro.
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('GROQ_API_KEY no está configurada en el servidor (SaaS AI Agent)');
    const err = new Error('El servicio de IA del panel SaaS no está disponible en este momento (falta GROQ_API_KEY en el servidor).');
    err.status = 503;
    err.code = 'GROQ_KEY_MISSING';
    throw err;
  }

  const groq = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  
  let chatMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : m.content[0].text
    }))
  ];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let response;
    try {
      response = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: chatMessages,
        tools,
        tool_choice: 'auto',
      });
    } catch (err) {
      throw wrapGroqError(err);
    }

    const msg = response.choices[0].message;
    
    if (!msg.tool_calls) {
      return { message: msg.content };
    }

    chatMessages.push(msg);

    for (const toolCall of msg.tool_calls) {
      const result = await execTool(toolCall.function.name, JSON.parse(toolCall.function.arguments));
      chatMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result)
      });
    }
  }

  return { message: "Lo siento, me tomó demasiado tiempo procesar los datos. ¿Puedes ser más específico?" };
}

module.exports = { runSaaSAgent };
