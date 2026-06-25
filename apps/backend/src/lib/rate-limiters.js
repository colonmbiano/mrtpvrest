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

// Creación de pedidos del storefront PÚBLICO (sin auth). El cap estricto de
// kiosko (8 PENDING/10min) solo aplica a source=KIOSK; los pedidos ONLINE
// quedaban solo bajo el global (2000/15min), suficiente para spamear miles de
// órdenes basura por IP. Limitamos el origen anónimo (web) y dejamos pasar al
// staff autenticado (TPV), al kiosko (cap propio) y al bridge de WhatsApp.
const storeOrderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders,
  legacyHeaders,
  message: {
    error: 'Demasiados pedidos desde esta conexión. Espera unos minutos.',
    code: 'ORDER_RATE_LIMIT',
  },
  skip: (req) => {
    if (req.headers.authorization) return true;
    const src = String(req.body?.source || '').toUpperCase();
    return src === 'KIOSK' || src === 'WHATSAPP';
  },
});

// Registro de cliente final del storefront: 5/hora por IP. Evita poblar la BD
// con cuentas CUSTOMER basura (mismo patrón que el spam de tenants).
const customerRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders,
  legacyHeaders,
  message: {
    error: 'Demasiados registros desde esta conexión. Intenta más tarde.',
    code: 'CUSTOMER_REGISTER_RATE_LIMIT',
  },
});

// Login de cliente final: 15/15min por IP. Corta fuerza bruta de credenciales
// de clientes sin molestar reintentos legítimos.
const customerLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders,
  legacyHeaders,
  message: {
    error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.',
    code: 'CUSTOMER_LOGIN_RATE_LIMIT',
  },
});

// Backstop de costo de IA POR TENANT. El aiLimiter existente es por IP; un
// atacante autenticado tras un NAT/proxy rotativo podía drenar la cuota de
// Groq/Gemini. Este límite, generoso para uso real (120/min por restaurante),
// solo frena un script desbocado. Degrada a IP si aún no se resolvió el tenant.
const aiTenantLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders,
  legacyHeaders,
  keyGenerator: (req) =>
    req.restaurantId || req.user?.restaurantId || req.headers['x-restaurant-id'] || req.ip,
  message: {
    error: 'Demasiadas solicitudes a IA para este negocio. Espera un minuto.',
    code: 'AI_TENANT_RATE_LIMIT',
  },
});

module.exports = {
  aiLimiter,
  refreshLimiter,
  resendVerifyLimiter,
  storeOrderLimiter,
  customerRegisterLimiter,
  customerLoginLimiter,
  aiTenantLimiter,
};
