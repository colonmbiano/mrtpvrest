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

sentry.init();

const app = express()
app.set('trust proxy', 1)
const server = http.createServer(app)

// CORS whitelist — URLs explícitas (audit M6). Se quitaron los patrones
// wildcard *.vercel.app y *.railway.app que aceptaban cualquier proyecto
// ajeno en esas plataformas. En dev se aceptan localhost + capacitor;
// en prod solo dominios oficiales + CORS_ORIGINS (extensión por env,
// separado por coma).
const PROD_ORIGINS = [
  /^https:\/\/([a-z0-9-]+\.)?mrtpvrest\.com\/?$/,
  'https://reparto.mrtpvrest.com',
  'https://mrtpvrest-admin.vercel.app',
  'https://mrtpvrest-tpv.vercel.app',
  'https://mrtpvrest-client.vercel.app',
  'https://mrtpvrest-landing.vercel.app',
  'https://mrtpvrest-saas.vercel.app',
  'https://mrtpvrest-kiosk.vercel.app',
  'https://colonmbianos-projects.vercel.app',
];

const DEV_ORIGINS = [
  'http://localhost',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3005',
  'http://localhost:3006',
  'http://localhost:8081',
  'http://127.0.0.1:3000',
  'capacitor://localhost',
];

const EXTRA_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = [
  ...PROD_ORIGINS,
  ...(process.env.NODE_ENV === 'production' ? [] : DEV_ORIGINS),
  ...EXTRA_ORIGINS,
];

const corsOptions = {
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
};

// Socket.io
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

app.set('io', io)

io.on('connection', (socket) => {
  const restaurantId = socket.handshake.query.restaurantId;
  console.log(`Cliente conectado: ${socket.id} (Restaurant: ${restaurantId || 'none'})`)

  if (restaurantId) {
    socket.join(`restaurant:${restaurantId}`);
    socket.on('join:admin',   () => socket.join(`restaurant:${restaurantId}:admins`))
    socket.on('join:kitchen', () => socket.join(`restaurant:${restaurantId}:kitchen`))
  }

  socket.on('join:order',   (orderId) => socket.join('order:' + orderId))
  socket.on('disconnect',   () => console.log('Cliente desconectado: ' + socket.id))
})

// Middlewares base
// Sentry requestHandler debe ir ANTES que cualquier otro middleware/router.
app.use(sentry.requestHandler())
app.use(helmet())
app.use(compression())
// 1. Aplicamos CORS
app.use(cors(corsOptions));
// 2. Respondemos automáticamente a TODAS las peticiones OPTIONS (Preflight)
app.options('*', cors(corsOptions));

// Webhook Stripe (B2B SaaS billing) — montado ANTES de express.json() porque
// la verificación de firma (constructEvent) exige el body crudo exacto.
app.use(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  require('./routes/saas-billing-webhook.routes')
)

app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

// Rutas públicas (sin tenantMiddleware)
app.use('/api/public', require('./routes/menu.routes'))
app.use('/api/store',  require('./routes/store.routes'))
app.use('/api/payments/terminal', require('./routes/terminal.routes'))
app.use('/api/kiosk/webhook',     require('./routes/kiosk-webhook.routes'))

// --- MIDDLEWARE DE SAAS (TENANT) ---
app.use(tenantMiddleware);

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 2000 : 10000,
  message: { error: 'Demasiadas peticiones' },
  skip: (req) => {
    const skipRoutes = ['/api/orders/admin', '/api/delivery/', '/api/menu/'];
    return skipRoutes.some(r => req.path.startsWith(r));
  }
}))

// Rutas
app.use('/api/auth',         require('./routes/auth.routes'))
app.use('/api/tenant',       require('./routes/tenant.routes'))
app.use('/api/locations',    require('./routes/locations.routes'))
app.use('/api/menu',         require('./routes/menu.routes'))
app.use('/api/shifts',       shiftsRoutes);
app.use('/api/orders',       require('./routes/orders.routes'))
app.use('/api/loyalty',      require('./routes/loyalty.routes'))
app.use('/api/kds',          require('./routes/kds.routes'))
app.use('/api/integrations', require('./routes/integrations.routes'))
app.use('/api/notifications',require('./routes/notifications.routes'))
app.use('/api/payments',     require('./routes/payments.routes'))
app.use('/api/reports',      require('./routes/reports.routes'))
app.use('/api/dashboard',    require('./routes/dashboard.routes'))
app.use('/api/upload',       require('./routes/upload.routes'))
app.use('/api/printers',     require('./routes/printers.routes'))
app.use('/api/gps',          require('./routes/gps.routes'))
app.use('/api/driver-cash',  require('./routes/driver-cash.routes'))
app.use('/api/delivery',     require('./routes/delivery.routes'))
app.use('/api/logistics',    require('./routes/logistics.routes'))
app.use('/api/tables',       require('./routes/tables.routes'))
app.use('/api/employees',    require('./routes/employees.routes'))
app.use('/api/waiters',      require('./routes/waiters.routes'))
app.use('/api/inventory',    require('./routes/inventory.routes'))
app.use('/api/banners',      require('./routes/banners.routes'))
app.use('/api/admin',        require('./routes/admin.routes'))
app.use('/api/saas',         require('./routes/saas.routes'))
app.use('/api/billing',      require('./routes/saas-billing.routes'))
app.use('/api/ai',           require('./routes/ai.routes'));
app.use('/api/onboarding',   require('./routes/onboarding.routes'));
app.use('/api/tpv/config',   require('./routes/tpv-config.routes'));
app.use('/api/kiosk',        require('./routes/kiosk.routes'));
app.use('/api/modules',      require('./routes/modules.routes'));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    saas: 'mrtpvrest',
    activeTenant: req.restaurantId || 'none'
  })
})

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada: ' + req.method + ' ' + req.path })
})

// Sentry errorHandler debe ir ANTES del handler de errores de la app.
app.use(sentry.errorHandler())

app.use((err, req, res, next) => {
  console.error('Error:', err.stack)
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Error interno' : err.message,
  })
})

// ── Jobs ─────────────────────────────────────────────────────────────────────
const { startTrialExpiryJob } = require('./jobs/trialExpiry.job')
startTrialExpiryJob()

const { startAutoPromosJob } = require('./jobs/autoPromos.job')
startAutoPromosJob()

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
