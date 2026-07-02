// src/index.js
require('dotenv').config()
const express     = require('express')
const http        = require('http')
const { Server }  = require('socket.io')
const cors        = require('cors')
const helmet      = require('helmet')
const compression = require('compression')
const morgan      = require('morgan')
const rateLimit   = require('express-rate-limit')
const sentry      = require('./lib/sentry');
const shiftsRoutes = require('./routes/shifts.routes');
const tenantMiddleware = require('./middleware/tenant.middleware');
const tenantContextMiddleware = require('./middleware/tenant-context.middleware');
const idempotencyMiddleware = require('./middleware/idempotency.middleware');
const correlationIdMiddleware = require('./middleware/correlation-id.middleware');
const legacyErrorResponseMiddleware = require('./middleware/legacy-error-response.middleware');
const errorMiddleware = require('./middleware/error.middleware');
const jwt = require('jsonwebtoken');

sentry.init();

const app = express()
app.set('trust proxy', 1)
const server = http.createServer(app)

const corsOptions = {
  origin: (origin, callback) => {
    // Permitir peticiones sin origen (como apps móviles o curl)
    if (!origin) return callback(null, true);
    
    let host = '';
    try {
      host = new URL(origin).hostname;
    } catch {
      host = '';
    }

    const isMrtpv = host === 'mrtpvrest.com' || host.endsWith('.mrtpvrest.com');
    const isVercel = process.env.ALLOW_VERCEL_PREVIEWS === 'true' && host.endsWith('.vercel.app');
    const isLocal = host === 'localhost' || host === '127.0.0.1' || origin.startsWith('capacitor://');
    // App de escritorio MODA+ (Tauri v2): el webview corre desde un origen propio,
    // tauri://localhost (macOS/Linux) y http://tauri.localhost (Windows/WebView2).
    // Sin esto, el fetch del webview va con Origin: http(s)://tauri.localhost y CORS
    // lo bloquea → la caja de escritorio "no se conecta al servidor".
    const isTauri = origin.startsWith('tauri://') || host === 'tauri.localhost';
    // Extensión de Chrome del TPV (apps/wa-chrome): lee pedidos de WhatsApp y
    // los manda a los endpoints públicos de /api/store. Sin cookies/credenciales,
    // y esos endpoints ya son públicos, así que permitir chrome-extension:// no
    // amplía la superficie.
    const isExtension = origin.startsWith('chrome-extension://');

    if (isMrtpv || isVercel || isLocal || isTauri || isExtension) {
      callback(null, true);
    } else {
      console.log('CORS Blocked Origin:', origin);
      callback(new Error('CORS not allowed for ' + origin));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-restaurant-id', 'x-location-id', 'x-restaurant-slug', 'x-location-slug', 'Idempotency-Key', 'x-correlation-id'],
  exposedHeaders: ['x-correlation-id']
};

// Socket.io
const io = new Server(server, {
  cors: {
    origin: corsOptions.origin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

app.set('io', io)

// Defensas: tope de conexiones por IP, rate limit de eventos, revalidación
// periódica de principales desactivados y validación de joins. Ver lib.
const {
  attachConnectionCap,
  createEventLimiter,
  startRevalidationSweep,
  locationBelongsToRestaurant,
  orderBelongsToRestaurant,
} = require('./lib/socket-guard')

attachConnectionCap(io)
startRevalidationSweep(io)

io.use((socket, next) => {
  const authHeader = String(socket.handshake.headers?.authorization || '');
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.query?.token ||
    authHeader.replace(/^Bearer\s+/i, '');

  if (token) {
    try {
      socket.data.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      socket.data.user = null;
    }
  }

  next();
})

io.on('connection', (socket) => {
  const restaurantId = socket.handshake.query.restaurantId;
  console.log(`Cliente conectado: ${socket.id} (Restaurant: ${restaurantId || 'none'})`)

  // Cupo de eventos entrantes por socket; exceder el cupo ignora el evento
  // (no desconecta: un cliente con reintentos agresivos no debe perder las
  // notificaciones por esto).
  const allowEvent = createEventLimiter(socket.id);

  const userRestaurantId = socket.data.user?.restaurantId;
  const canJoinRestaurant = restaurantId && (
    socket.data.user?.role === 'SUPER_ADMIN' ||
    (userRestaurantId && userRestaurantId === restaurantId)
  );

  if (canJoinRestaurant) {
    socket.join(`restaurant:${restaurantId}`);
    socket.on('join:admin',   () => { if (allowEvent()) socket.join(`restaurant:${restaurantId}:admins`) })
    socket.on('join:kitchen', () => { if (allowEvent()) socket.join(`restaurant:${restaurantId}:kitchen`) })
    // Los ids del payload se verifican contra el restaurante del socket: sin
    // esto, un cliente podía unirse a rooms de sucursales/órdenes ajenas
    // armando el nombre del room con un id de otro tenant.
    socket.on('join:location:admin', async (locationId) => {
      if (!allowEvent()) return
      if (await locationBelongsToRestaurant(locationId, restaurantId)) {
        socket.join(`restaurant:${restaurantId}:location:${locationId}:admins`)
      }
    })
    socket.on('join:location:kitchen', async (locationId) => {
      if (!allowEvent()) return
      if (await locationBelongsToRestaurant(locationId, restaurantId)) {
        socket.join(`restaurant:${restaurantId}:location:${locationId}:kitchen`)
      }
    })
  }

  // Sala personal del repartidor — derivada del token verificado (no spoofeable
  // por query params). Permite empujarle en tiempo real asignaciones de pedido
  // y respuestas del restaurante. Ver delivery.routes.js (/assign y /messages).
  const tokenUser = socket.data.user;
  if (tokenUser?.id && tokenUser?.role === 'DELIVERY') {
    socket.join(`driver:${tokenUser.id}`)
    // Sala de broadcast para avisos a todos los repartidores del restaurante.
    if (tokenUser.restaurantId) socket.join(`restaurant:${tokenUser.restaurantId}:drivers`)
  }

  socket.on('join:order', async (orderId) => {
    if (!canJoinRestaurant || !allowEvent()) return
    if (await orderBelongsToRestaurant(orderId, restaurantId)) {
      socket.join('order:' + orderId)
    }
  })
  socket.on('disconnect',   () => console.log('Cliente desconectado: ' + socket.id))
})

// Middlewares base
// Sentry requestHandler debe ir ANTES que cualquier otro middleware/router.
app.use(sentry.requestHandler())
app.use(helmet())
app.use(compression())
// 1. Aplicamos CORS
app.use(cors(corsOptions));

// Correlación de requests: genera/propaga x-correlation-id y abre el scope
// AsyncLocalStorage. Va lo más temprano posible para que TODO log y la
// respuesta de error lleven el mismo id. tenantContextMiddleware lo preserva
// más abajo al fusionar el contexto con el restaurantId resuelto.
app.use(correlationIdMiddleware);

// Webhook Stripe (B2B SaaS billing) — montado ANTES de express.json() porque
// la verificación de firma (constructEvent) exige el body crudo exacto.
app.use(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  require('./routes/saas-billing-webhook.routes')
)

app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))

// Decimal de Prisma → number en TODAS las respuestas JSON (Etapa 0 del plan
// docs/plan-decimal-migration.md): al migrar columnas Float→Decimal el
// contrato HTTP de los frontends no cambia (siguen recibiendo number).
// OJO: JSON.stringify llama toJSON() ANTES del replacer (Decimal.toJSON
// devuelve string), así que hay que mirar el valor CRUDO en this[key].
app.set('json replacer', function (key, value) {
  const raw = this ? this[key] : undefined
  if (raw && typeof raw === 'object' && raw.constructor?.name === 'Decimal') {
    return Number(raw)
  }
  return value
})
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

// Rutas públicas (sin tenantMiddleware)
app.use('/api/public', require('./routes/menu.routes'))
app.use('/api/store',  require('./routes/store.routes'))
app.use('/api/payments/terminal', require('./routes/terminal.routes'))
app.use('/api/kiosk/webhook',     require('./routes/kiosk-webhook.routes'))
// Chatbot de WhatsApp — webhook público multi-tenant (resuelve restaurante por
// :restaurantId en la URL). Sin tenantMiddleware: el proveedor no manda headers.
app.use('/api/whatsapp/webhook',  require('./routes/whatsapp-webhook.routes'))
// OTA — el TPV consulta esto en arranque sin contexto de tenant todavía.
// /publish, /bundles y DELETE están protegidos con SUPER_ADMIN dentro del router.
app.use('/api/ota',               require('./routes/ota.routes'))

// --- MIDDLEWARE DE SAAS (TENANT) ---
app.use(tenantMiddleware);

// Abre el contexto AsyncLocalStorage con el restaurante resuelto para que el
// guard de Prisma aísle las queries por restaurantId aguas abajo.
app.use(tenantContextMiddleware);

// Idempotencia para replays de la cola offline del TPV. Va DESPUÉS del
// tenant middleware para que tengamos req.restaurantId al scopear la
// key. Solo aplica si el cliente manda el header Idempotency-Key.
app.use(idempotencyMiddleware);

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 2000 : 10000,
  message: { error: 'Demasiadas peticiones' },
  skip: (req) => {
    const skipRoutes = ['/api/orders/admin', '/api/delivery/', '/api/menu/'];
    return skipRoutes.some(r => req.path.startsWith(r));
  }
}))

// Compatibilidad: sanea respuestas 5xx de handlers legacy que todavía hacen
// res.status(500).json(...) directo, sin filtrar mensajes internos y añadiendo
// correlationId. No toca 4xx ni respuestas exitosas. Ver migración a AppError.
app.use(legacyErrorResponseMiddleware)

// Rutas
app.use('/api/auth',         require('./routes/auth.routes'))
app.use('/api/terminal',   require('./routes/terminal.routes'))
app.use('/api/sync',       require('./routes/sync.routes'))
app.use('/api/locations',  require('./routes/locations.routes'))

app.use('/api/menu',         require('./routes/menu.routes'))
app.use('/api/shifts',       shiftsRoutes);
app.use('/api/orders',       require('./routes/orders.routes'))
app.use('/api/customers',    require('./routes/customers.routes'))
app.use('/api/loyalty',      require('./routes/loyalty.routes'))
app.use('/api/kds',          require('./routes/kds.routes'))
app.use('/api/integrations', require('./routes/integrations.routes'))
app.use('/api/whatsapp/marketing', require('./routes/whatsapp-marketing.routes'))
app.use('/api/notifications',require('./routes/notifications.routes'))
app.use('/api/payments',     require('./routes/payments.routes'))
app.use('/api/reports',      require('./routes/reports.routes'))
app.use('/api/dashboard',    require('./routes/dashboard.routes'))
app.use('/api/upload',       require('./routes/upload.routes'))
app.use('/api/printers',     require('./routes/printers.routes'))
app.use('/api/printer-groups', require('./routes/printer-groups.routes'))
app.use('/api/gps',          require('./routes/gps.routes'))
app.use('/api/driver-cash',  require('./routes/driver-cash.routes'))
app.use('/api/delivery',     require('./routes/delivery.routes'))
app.use('/api/logistics',    require('./routes/logistics.routes'))
app.use('/api/tables',       require('./routes/tables.routes'))
app.use('/api/zones',        require('./routes/zones.routes'))
app.use('/api/employees',    require('./routes/employees.routes'))
app.use('/api/payroll',      require('./routes/payroll.routes'))
app.use('/api/devices',      require('./routes/devices.routes'))
app.use('/api/workspaces',   require('./routes/workspaces.routes'))
app.use('/api/tenant',       require('./routes/tenant.routes'))
app.use('/api/waiters',      require('./routes/waiters.routes'))
app.use('/api/inventory',    require('./routes/inventory.routes'))
app.use('/api/banners',      require('./routes/banners.routes'))
app.use('/api/promos',       require('./routes/promos.routes'))
app.use('/api/bulk-promos',  require('./routes/bulk-promos.routes'))
app.use('/api/admin',        require('./routes/admin.routes'))
app.use('/api/saas',         require('./routes/saas.routes'))
app.use('/api/billing',      require('./routes/saas-billing.routes'))
app.use('/api/ai',           require('./routes/ai.routes'));
app.use('/api/saas-ai',      require('./routes/saas-ai.routes'));
app.use('/api/onboarding',   require('./routes/onboarding.routes'));
app.use('/api/tpv/config',   require('./routes/tpv-config.routes'));
app.use('/api/kiosk',        require('./routes/kiosk.routes'));
app.use('/api/modules',      require('./routes/modules.routes'));
app.use('/api/tasks',        require('./routes/tasks.routes'));
app.use('/api/admin/logs',   require('./routes/logs.routes'));
app.use('/api/expenses',     require('./routes/expenses.routes'));
app.use('/api/purchases',    require('./routes/purchases.routes'));
app.use('/api/payables',     require('./routes/payables.routes'));
app.use('/api/transfers',    require('./routes/transfers.routes'));
app.use('/api/recipes',      require('./routes/recipes.routes'));
app.use('/api/reports',      require('./routes/expenses-reports.routes'));
app.use('/api/sales',        require('./routes/sales-import.routes'))
app.use('/api/finance',      require('./routes/finance.routes'));
app.use('/api/retail/v1',    require('./routes/retail.routes'));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    saas: 'mrtpvrest',
    activeTenant: req.restaurantId || 'none'
  })
})

// /health/auth — métricas in-memory del middleware de autenticación.
// Útil para detectar oleadas de token_expired (clock skew, refresh roto)
// o token_malformed (cliente enviando bearer mal formado).
const { getAuthCounters } = require('./lib/auth-metrics');
app.get('/health/auth', (req, res) => {
  res.json({ status: 'ok', ...getAuthCounters() });
})

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada: ' + req.method + ' ' + req.path })
})

// Sentry errorHandler debe ir ANTES del handler de errores de la app.
app.use(sentry.errorHandler())

// Middleware global de errores. Captura cualquier excepción no manejada,
// responde con un envelope estándar (error/errorCode/correlationId) sin
// filtrar mensajes internos en 5xx, la persiste en SystemLog para el panel
// super-admin y enriquece el log con el correlationId del request.
app.use(errorMiddleware)

// ── Jobs ─────────────────────────────────────────────────────────────────────
const { startTrialExpiryJob } = require('./jobs/trialExpiry.job')
startTrialExpiryJob()

const { startAutoPromosJob } = require('./jobs/autoPromos.job')
startAutoPromosJob()

const { startUnverifiedPurgeJob } = require('./jobs/unverifiedPurge.job')
startUnverifiedPurgeJob()

const { startRecurringPayablesJob } = require('./jobs/recurringPayables.job')
startRecurringPayablesJob()

// WhatsApp Bot — requiere flag propio ADEMÁS de la key de Gemini: Railway
// tiene GOOGLE_AI_API_KEY (visión) y sin el flag el backend de prod
// intentaría levantar Chromium/puppeteer en cada deploy. El bot corre donde
// WHATSAPP_BOT_ENABLED=true (hoy: la PC local).
const { initWhatsApp } = require('./whatsapp/client')
if (process.env.WHATSAPP_BOT_ENABLED === 'true' && process.env.GOOGLE_AI_API_KEY) {
  initWhatsApp(io)
} else if (process.env.GOOGLE_AI_API_KEY) {
  console.log('[WhatsApp Bot] Deshabilitado (setea WHATSAPP_BOT_ENABLED=true para activarlo)')
}

const PORT = process.env.PORT || 3001
server.listen(PORT,'0.0.0.0', () => {
  console.log('┌─────────────────────────────────┐')
  console.log('│       MRTPVREST SAAS API        │')
  console.log('│  Puerto: ' + PORT + '                    │')
  console.log('│  Health: /health                 │')
  console.log('└─────────────────────────────────┘')
  console.log('  Entorno: ' + (process.env.NODE_ENV || 'development'))
})

module.exports = { app, server, io }
