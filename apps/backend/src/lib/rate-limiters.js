// Presets de rate-limit del backend.
// Centralizar aquí evita duplicar configuración en cada route.
//
// Uso:
//   const { aiLimiter } = require('../lib/rate-limiters');
//   router.post('/scan-menu', aiLimiter, authenticate, ...)
//
// Notas:
// - keyGenerator default = IP. Para endpoints autenticados podríamos derivar
//   de req.user?.id, pero el limiter corre antes de authenticate.
// - skipFailedRequests:true cuenta solo requests exitosos en algunos limiters
//   para no penalizar al usuario por errores del servidor.

const rateLimit = require('express-rate-limit');

const standardHeaders = true;
const legacyHeaders = false;

// IA: endpoints caros (Gemini Vision, Groq, Claude). Por usuario admin auth,
// pero el bloqueo es por IP para no requerir authenticate antes del limiter.
// 30/min permite usar el escaneo de menú con varias imágenes sin bloquear,
// pero corta abuso si alguien automatiza llamadas.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders,
  legacyHeaders,
  message: {
    error: 'Demasiadas solicitudes a IA. Espera un minuto e intenta de nuevo.',
    code: 'AI_RATE_LIMIT',
  },
});

// Refresh token: anti-abuso de rotación. 20/hour por IP es generoso para uso
// normal (refresh ~cada 15 min) y corta intentos masivos de refresh tras un
// posible token leak.
const refreshLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders,
  legacyHeaders,
  message: {
    error: 'Demasiados refresh de sesión. Cierra sesión e inicia de nuevo.',
    code: 'REFRESH_RATE_LIMIT',
  },
});

// Resend verification email: 5/hour por IP. Evita abuso de email + costo SES.
const resendVerifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders,
  legacyHeaders,
  message: {
    error: 'Demasiadas solicitudes de reenvío. Intenta en una hora.',
    code: 'RESEND_RATE_LIMIT',
  },
});

// Forgot-password: 5/hour por IP. Evita abuso de envío de emails de reset
// (costo + spam al usuario). El endpoint responde uniforme (anti-enumeración),
// así que el limiter es la única defensa contra fuerza bruta de solicitudes.
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders,
  legacyHeaders,
  message: {
    error: 'Demasiadas solicitudes de restablecimiento. Intenta en una hora.',
    code: 'FORGOT_RATE_LIMIT',
  },
});

module.exports = {
  aiLimiter,
  refreshLimiter,
  resendVerifyLimiter,
  forgotPasswordLimiter,
};
