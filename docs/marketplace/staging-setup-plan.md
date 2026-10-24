# MRTPVREST Marketplace - Plan de Setup Staging Cloud

**Fecha:** 2026-10-23  
**Status:** Plan Ejecutable  
**Opción:** Cloud Completo (Railway + Vercel + Supabase)

---

## 📋 Checklist de Ejecución

### Fase 1: Railway (Backend + Database)

#### 1.1 Autenticar Railway
```bash
railway login
# Completar el flujo OAuth en navegador
```

#### 1.2 Crear Proyecto Railway
```bash
railway project create mrtpvrest-marketplace-staging
# Retorna: PROJECT_ID
```

**Identifiers a guardar:**
```
RAILWAY_PROJECT_ID = <PROJECT_ID>
RAILWAY_ENVIRONMENT_ID = production (default)
```

#### 1.3 Provisionar PostgreSQL
```bash
railway service add postgresql
# Seleccionar proyecto: mrtpvrest-marketplace-staging
# Esperar ~2 minutos a que esté listo
```

Verificar credenciales:
```bash
railway service details postgresql
# Copiar: DATABASE_URL (para .env)
```

#### 1.4 Provisionar Redis
```bash
railway service add redis
# Seleccionar proyecto: mrtpvrest-marketplace-staging
```

Verificar credenciales:
```bash
railway service details redis
# Copiar: REDIS_URL (para .env)
```

#### 1.5 Crear Servicio Backend
```bash
railway service add github colonmbiano/mrtpvrest
# Root directory: apps/backend
# Usar DATABASE_URL de PostgreSQL
# Usar REDIS_URL de Redis
```

**Variables de entorno en Railway:**
```
NODE_ENV = production
DATABASE_URL = <copiar de PostgreSQL>
DIRECT_URL = <copiar de PostgreSQL sin pooler>
REDIS_URL = <copiar de Redis>
JWT_SECRET = <generar: openssl rand -base64 32>
ENCRYPTION_KEY = <generar: openssl rand -base64 32>
MARKETPLACE_ISOLATED = true
MARKETPLACE_ALLOWED_ORIGINS = https://mrtpvrest-marketplace-client-staging.vercel.app,https://mrtpvrest-marketplace-admin-staging.vercel.app
```

---

### Fase 2: Vercel (Frontends)

#### 2.1 Crear Proyecto Client
```bash
# En dashboard: https://vercel.com/new
# Nombre: mrtpvrest-marketplace-client-staging
# Framework: Next.js
# Root directory: apps/client
# Git: feature/marketplace-hibrido
```

**Variables de Entorno (en Vercel):**
```
NEXT_PUBLIC_MARKETPLACE_ISOLATED = true
NEXT_PUBLIC_MARKETPLACE_CATALOG = true
NEXT_PUBLIC_API_URL = https://mrtpvrest-marketplace-backend-staging.railway.app
NEXT_PUBLIC_SITE_URL = https://mrtpvrest-marketplace-client-staging.vercel.app
```

#### 2.2 Crear Proyecto Admin
```bash
# En dashboard: https://vercel.com/new
# Nombre: mrtpvrest-marketplace-admin-staging
# Framework: Next.js
# Root directory: apps/admin
# Git: feature/marketplace-hibrido
```

**Variables de Entorno:**
```
NEXT_PUBLIC_MARKETPLACE_ISOLATED = true
NEXT_PUBLIC_API_URL = https://mrtpvrest-marketplace-backend-staging.railway.app
NEXT_PUBLIC_SITE_URL = https://mrtpvrest-marketplace-admin-staging.vercel.app
```

#### 2.3 Crear Proyecto SaaS (opcional para métricas)
```bash
# Nombre: mrtpvrest-marketplace-saas-staging
# Framework: Next.js
# Root directory: apps/saas
# Git: feature/marketplace-hibrido
```

---

### Fase 3: Supabase (opcional - solo si necesitas Storage)

#### 3.1 Crear Proyecto Supabase
```
Ir a: https://supabase.com/dashboard/projects
Crear nuevo proyecto: mrtpvrest-marketplace-staging
Region: us-east-1
```

**Identifiers:**
```
SUPABASE_PROJECT_ID = <PROJECT_ID>
SUPABASE_URL = https://<project-ref>.supabase.co
SUPABASE_ANON_KEY = <public key>
SUPABASE_SERVICE_ROLE = <secret key> — SOLO backend
```

#### 3.2 Configurar Buckets Storage
```sql
-- En SQL Editor de Supabase
create bucket 'marketplace-staging' (
  public = false,
  avif_autodetection = false
);

create policy "Allow authenticated users to upload"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'marketplace-staging');
```

---

## 🔐 Secrets & Credenciales

### Generar secretos locales (no usar producción)
```bash
# JWT
openssl rand -base64 32
# Resultado: <JWT_SECRET>

# Encryption
openssl rand -base64 32
# Resultado: <ENCRYPTION_KEY>

# Stripe (Sandbox)
# Ir a: https://dashboard.stripe.com/apikeys
# Copiar: sk_test_... (test secret key)

# Mercado Pago (Sandbox)
# Ir a: https://www.mercadopago.com/developers/panel/home
# Copiar: APP_ID y APP_SECRET (sandbox)
```

### Validar que NO hay credenciales productivas
```bash
# En terminal, verificar .env
grep -E '(live|prod|production|sk_live)' .env apps/backend/.env apps/client/.env.local 2>/dev/null || echo "✓ Sin credenciales live"
```

---

## 🗄️ Database & Seed

### Fase 1: Migraciones
```bash
# En local (contra BD de staging):
DATABASE_URL=<URL de Railway> pnpm --filter @mrtpvrest/database exec prisma migrate deploy

# Alternativamente, Railway ejecuta automáticamente en deploy:
# apps/backend/Dockerfile CMD incluye: prisma migrate deploy
```

### Fase 2: Seeding (datos sintéticos)
```bash
# Generar datos de prueba
DATABASE_URL=<URL de Railway> pnpm --filter @mrtpvrest/database exec prisma db seed

# Script: apps/backend/prisma/seed.js
# Crea:
#  - 1 SUPER_ADMIN (user: admin@staging, pass: staging123)
#  - 3 tenant de marketplace
#  - 14 tiendas sintetizadas
#  - 100+ productos
```

---

## 🔗 Integraciones Externas (Staging Mode)

| Servicio | Producción | Staging | Acción |
|----------|-----------|---------|--------|
| **Stripe** | sk_live_... | sk_test_... | Usar test keys |
| **Mercado Pago** | APP_ID_PROD | APP_ID_SANDBOX | Usar sandbox credentials |
| **Email** | Sendgrid LIVE | Ethereal/Mailhog | Mockear o capturador local |
| **WhatsApp** | Twilio LIVE | DESACTIVADO | No enviar mensajes reales |
| **Push Notifications** | VAPID keys LIVE | DESACTIVADO | No registrar dispositivos |
| **Storage** | Cloudinary LIVE | Supabase Staging | Bucket separado |
| **IA** | Gemini API LIVE | DESACTIVADO | Mock responses |

---

## ✅ Validaciones Post-Setup

### Validar aislamiento
```bash
# 1. Backend NO conecta a BD de producción
curl https://mrtpvrest-marketplace-backend-staging.railway.app/health
# Respuesta: { "status": "ok", "database": "staging" }

# 2. Client NO redirige a producción
curl https://mrtpvrest-marketplace-client-staging.vercel.app
# Verificar en HTML: NEXT_PUBLIC_MARKETPLACE_ISOLATED = true

# 3. Admin NO usa credenciales productivas
# Revisar Network tab en DevTools
# APIs deben apuntar a: *.railway.app (staging)
```

### Validar datos
```bash
# 4. BD contiene solo datos sintéticos
SELECT COUNT(*) FROM restaurants;
# Resultado: 3 (tenants de test)

SELECT COUNT(*) FROM "DeliveryStore";
# Resultado: 14 (tiendas sintetizadas)
```

### Validar logs
```bash
# 5. Sin errores de conexión a servicios productivos
railway logs -f backend
# NO debe contener: "production", "live", "prod.*.com"
```

---

## 🚀 Deploy & Verificación

### Opción A: Auto-deploy (recomendado)
```
Vercel: Auto-deploy en cada push a feature/marketplace-hibrido
Railway: Auto-deploy en cada push a feature/marketplace-hibrido
```

**Desactivar Preview Deployments** (en Vercel dashboard):
```
Proyecto > Settings > Git > Production Branch
Desactivar "Preview Deployments from Pull Requests"
```

### Opción B: Deploy Manual
```bash
# Vercel
vercel deploy --prod

# Railway
railway deploy
```

---

## 📝 Post-Deployment Checklist

- [ ] Backend running: `curl https://.../health` → 200
- [ ] Client loads: `https://mrtpvrest-marketplace-client-staging.vercel.app` → catálogo visible
- [ ] Marketplace isolated: NEXT_PUBLIC_MARKETPLACE_ISOLATED = true
- [ ] DB migrations applied: `SELECT version()` en Supabase
- [ ] Seed data loaded: 14 tiendas + 3 tenants
- [ ] E2E tests passing: `pnpm test:e2e`
- [ ] No console errors (DevTools)
- [ ] API responses: 200/201 (sin 5xx errors)
- [ ] Network tab: ALL APIs apuntan a staging (no producción)
- [ ] Stripe/Mercado Pago: TEST MODE confirmado
- [ ] Logs: Sin credenciales visibles (`railway logs`)

---

## 🆘 Troubleshooting

| Problema | Causa | Solución |
|----------|-------|----------|
| 503 en /products | DB no migró | `railway run prisma migrate deploy` |
| CORS error | Origins bloqueados | Revisar MARKETPLACE_ALLOWED_ORIGINS en Railway |
| "Cannot find module" | node_modules obsoleto | `vercel rebuild` en Vercel dashboard |
| Webhook falla | Staging webhook URL incorrecta | Actualizar en Stripe/MercadoPago |
| Email no llega | Credenciales productivas | Verificar Ethereal/Mailhog en backend logs |

---

## 📊 Monitoreo

### Railway Monitoring
```
https://railway.app/project/<PROJECT_ID>
- Logs: real-time
- Metrics: CPU, Memory, Disk
- Deployments: historial
```

### Vercel Monitoring
```
https://vercel.com/dashboard
- Analytics: request counts
- Deployments: status
- Logs: edge + serverless
```

### Health Checks
```bash
# Automatizar cada 5 minutos en local (mientras desarrollas)
watch -n 300 'curl -s https://mrtpvrest-marketplace-backend-staging.railway.app/health | jq'
```

---

## 🎯 Siguientes Pasos

1. **Ejecutar Fase 1-3** de este plan (manual vía dashboards + CLI)
2. **Guardar Identifiers** en un archivo seguro (no versionar)
3. **Validar con checklist** arriba
4. **Ejecutar E2E tests** contra staging
5. **Documentar blockers** en `docs/marketplace/staging-blockers.md`
6. **Preparar merge** a master

---

**Tiempo estimado:** 30-45 minutos  
**Costo estimado:** ~$20-40/mes (PostgreSQL + Redis + Node compute en Railway)

