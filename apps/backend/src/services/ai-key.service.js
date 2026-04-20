// Resuelve la API key de Gemini a usar por request, con lógica BYOK + trial:
//
// 1. Si el Restaurant tiene aiApiKey cifrada → descifrar y usar.
// 2. Si no tiene key pero la suscripción está en TRIAL no expirado → usar la
//    key de plataforma (process.env.GOOGLE_AI_API_KEY) como cortesía.
// 3. Si el trial expiró o no está en TRIAL y no hay key → throw AI_KEY_REQUIRED.
//
// Todos los endpoints IA (scan-menu, scan-inventory, assistant, onboarding)
// deben pasar por esta función antes de instanciar GoogleGenerativeAI.

const { prisma } = require('@mrtpvrest/database');
const { decryptSecret } = require('../lib/secret-crypto');

async function resolveAiKey({ restaurantId }) {
  if (!restaurantId) {
    const err = new Error('Restaurante no identificado.');
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      aiApiKey: true,
      tenant: {
        select: {
          subscription: {
            select: { status: true, trialEndsAt: true },
          },
        },
      },
    },
  });

  if (!restaurant) {
    const err = new Error('Restaurante no encontrado.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  // 1) Key propia del cliente
  if (restaurant.aiApiKey) {
    const plain = decryptSecret(restaurant.aiApiKey);
    if (plain) return { apiKey: plain, source: 'customer' };
    // Key almacenada pero no desencriptable (rotaron AI_ENCRYPTION_KEY)
    const err = new Error('La API key guardada no se pudo desencriptar. Vuelve a capturarla en Integraciones.');
    err.code = 'AI_KEY_CORRUPTED';
    throw err;
  }

  // 2) Fallback a la plataforma durante trial activo
  const sub = restaurant.tenant?.subscription;
  const trialActive = sub?.status === 'TRIAL'
    && sub.trialEndsAt
    && new Date(sub.trialEndsAt) > new Date();

  if (trialActive) {
    const platformKey = process.env.GOOGLE_AI_API_KEY;
    if (platformKey) return { apiKey: platformKey, source: 'platform-trial' };
  }

  // 3) No hay key propia + trial inactivo → cliente debe configurar la suya
  const err = new Error('Configura tu API key de Google AI Studio en Integraciones para usar las funciones IA.');
  err.code = 'AI_KEY_REQUIRED';
  throw err;
}

module.exports = { resolveAiKey };
