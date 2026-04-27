// Resolución de API keys de IA por request. Después de la migración:
//
// CHAT / TEXTO (Groq, llama-3.1-8b-instant) → resolveGroqKey({ restaurantId }):
//   1. Si Restaurant.aiApiKey existe (BYOK del cliente) → descifrar y usar.
//   2. Si no, y la suscripción está en TRIAL no expirado → fallback a la
//      key de plataforma (process.env.GROQ_API_KEY).
//   3. En cualquier otro caso → throw AI_KEY_REQUIRED para que el cliente
//      capture su Groq API key en Integraciones.
//
// VISION (Gemini 1.5 Flash) → resolveGeminiKey():
//   - Solo usa la key de plataforma (process.env.GOOGLE_AI_API_KEY).
//   - El escaneo de imágenes (menú, tickets/facturas) se cobra en el plan,
//     no requiere BYOK por parte del tenant.
//   - Si la variable no está configurada → throw AI_KEY_REQUIRED.
//
// Validación al guardar BYOK: la key del cliente se prueba contra Groq con un
// chat.completions.create de ping antes de cifrarse y persistir. Esa lógica
// vive en routes/admin.routes.js (POST /api/admin/ai-key).

const { prisma } = require('@mrtpvrest/database');
const { decryptSecret } = require('../lib/secret-crypto');

async function resolveGroqKey({ restaurantId }) {
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

  if (restaurant.aiApiKey) {
    const plain = decryptSecret(restaurant.aiApiKey);
    if (plain) return { apiKey: plain, source: 'customer', provider: 'groq' };
    const err = new Error('La API key guardada no se pudo desencriptar. Vuelve a capturarla en Integraciones.');
    err.code = 'AI_KEY_CORRUPTED';
    throw err;
  }

  const sub = restaurant.tenant?.subscription;
  const trialActive = sub?.status === 'TRIAL'
    && sub.trialEndsAt
    && new Date(sub.trialEndsAt) > new Date();

  if (trialActive) {
    const platformKey = process.env.GROQ_API_KEY;
    if (platformKey) return { apiKey: platformKey, source: 'platform-trial', provider: 'groq' };
  }

  const err = new Error('Configura tu API key de Groq Cloud en Integraciones para usar las funciones IA.');
  err.code = 'AI_KEY_REQUIRED';
  throw err;
}

function resolveGeminiKey() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    const err = new Error('GOOGLE_AI_API_KEY no está configurada en el servidor. El escaneo por imagen no está disponible.');
    err.code = 'AI_KEY_REQUIRED';
    throw err;
  }
  return { apiKey, source: 'platform', provider: 'gemini' };
}

// Alias retro-compatible. Los call sites antiguos (chat / asistente) seguían
// usando `resolveAiKey`; tras la migración apunta al resolver de Groq.
const resolveAiKey = resolveGroqKey;

module.exports = { resolveAiKey, resolveGroqKey, resolveGeminiKey };
