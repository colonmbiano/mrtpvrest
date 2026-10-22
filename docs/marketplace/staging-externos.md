# Bloqueos 6, 7 y 8: servicios externos y automatización de deploy

**Fecha:** 22 de octubre de 2026 · **Autor:** Claude Code
Revisión **local y de solo lectura** de los archivos del repo. No se consultaron
GitHub, Vercel, Railway ni Supabase, y no se leyeron valores de ningún `.env`:
aquí solo aparecen nombres de variables (de `.marketplace-local/audit.json`).

## 8. Qué se dispararía al publicar esta rama

### GitHub Actions (18 workflows en `.github/workflows/`)

- **Push a `feature/marketplace-hibrido`: ningún workflow.** Todos los `push` están
  limitados a `master`/`main` o a tags (`tpv-v*`, `apks-rel-v*`, `moda-v*`).
- **Pull request de esta rama:**
  - Hacia **cualquier** base, por rutas: `build-android-apk.yml` (apps/tpv),
    `build-android-apk-kds.yml`, `build-android-apk-meseros-lite.yml` y
    `build-android-apk-delivery.yml`. Esta rama toca TPV, KDS y Meseros Lite, así
    que **un PR compilaría esos tres APK**. No usan secretos de firma (solo los
    workflows de release los usan).
  - Hacia `master`: `ci-admin`, `ci-backend`, `ci-client`, `ci-moda`, `ci-tpv` (type-check,
    lint y build en CI) y `e2e.yml`, que levanta su propio Postgres efímero en
    `localhost`, migra y siembra con los secretos `SEED_*`/`*_PIN`. No toca la BD real.
- **Releases y OTA** (`*-ota-release.yml`, `build-*-release.yml`, `moda-windows-release.yml`):
  solo con push a `master`, tags o ejecución manual. No crear tags ni lanzar
  `workflow_dispatch` desde esta rama.

### Vercel (`apps/*/vercel.json`)

- Ninguno define `git.deploymentEnabled`. **Si la integración Git está conectada,
  el primer push creará Preview deployments** de cada app modificada: client,
  TPV, KDS, Kiosk, SaaS, Moda y Meseros Lite si está en Vercel. `turbo-ignore`
  solo omite las apps sin cambios.
- Esos previews usan las variables **Preview** del dashboard, que no se pueden ver
  desde el repo. Sin `NEXT_PUBLIC_MARKETPLACE_ISOLATED` se comportan como
  producción: el client redirige a mrtpvrest.com y las demás apps usan su API configurada.
- **Antes del primer push (decisión del usuario):** desactivar los deploys de esta
  rama en el dashboard de cada proyecto, o añadir a cada `vercel.json`
  `"git": { "deploymentEnabled": { "feature/marketplace-hibrido": false } }`.
  No se aplicó: es configuración de deploy compartida y el dashboard puede tener
  la última palabra.

### Railway (`apps/backend/railway.json`)

- `builder: DOCKERFILE` con `startCommand: node src/index.js`. Según la documentación
  de Railway (docs.railway.com/deployments/start-command), con Dockerfile el start
  command **sustituye el `ENTRYPOINT` en forma exec**, y el `CMD` solo se usa si no
  hay start command. Por eso, en un servicio que lea este `railway.json`,
  `migrate deploy` del `CMD` no correría.
- Inconsistencia a revisar: el Dockerfile usa `WORKDIR /app` y copia el monorepo
  completo, así que el backend queda en `/app/apps/backend/src/index.js`. En cambio,
  `node src/index.js` busca `/app/src/index.js`. Eso solo funcionaría si el servicio
  tiene configurado otro directorio raíz o un start command propio en el dashboard.
  No se pudo comprobar cuál usa cada servicio ni qué rama despliega.
- El `CMD` del Dockerfile ya omite la migración con `MARKETPLACE_ISOLATED=true` (bloqueo 4).
- Recomendación: un servicio Railway nuevo para staging, con autodeploy apagado
  y la rama elegida a mano (paso 4 de "Siguientes pasos" en MARKETPLACE-STAGING.md).

## 6 y 7. Variables de servicios externos

En la copia local, todas deben quedar **vacías, en sandbox o apuntando a un
capturador local**. Nunca valores productivos. Se agrupan por servicio:

| Servicio | Variables | Valor en la copia aislada |
| --- | --- | --- |
| Pagos | `STRIPE_SECRET_KEY` `STRIPE_WEBHOOK_SECRET` `STRIPE_CURRENCY` `STRIPE_*_URL` `MP_ACCESS_TOKEN` `MP_PUBLIC_KEY` `MP_WEBHOOK_SECRET` `MERCADOPAGO_ACCESS_TOKEN` `MERCADOPAGO_WEBHOOK_SECRET` `MERCADOPAGO_*` | Vacías, o claves **test** (`sk_test_…`, credenciales de prueba de MP) |
| Correo | `RESEND_API_KEY` `SMTP_USER` `SMTP_FROM_EMAIL` `SMTP_FROM_NAME` `ADMIN_ALERT_EMAIL` `BOT_ALERT_EMAIL` `ADMIN_EMAIL` `DEMO_EMAIL` `TENANT_EMAIL` `VAPID_EMAIL` | Vacías o capturador local (Mailpit/MailHog en loopback); destinatarios ficticios |
| WhatsApp | `WHATSAPP_TOKEN` `WHATSAPP_VERIFY_TOKEN` `WHATSAPP_API_URL` `WA_API_BASE` `WA_SLUG` `WHATSAPP_NLU_ENABLED` | Vacías; `WHATSAPP_NLU_ENABLED=false` |
| Bot de ventas | `SALES_BOT_TOKEN` `MRTPV_SALES_BOT_TOKEN` `SALES_WA_WORKER_URL` `SALES_WA_*` `SALES_DEMO_STORE_URL` `SALES_LEADS_PATH` | Vacías; no arrancar el worker de WhatsApp de ventas |
| IA | `ANTHROPIC_API_KEY` `GOOGLE_AI_API_KEY` `GROQ_API_KEY` | Vacías, o claves propias de staging con límite de gasto |
| Almacenamiento | `CLOUDINARY_CLOUD_NAME` `CLOUDINARY_API_KEY` `CLOUDINARY_API_SECRET` `SUPABASE_URL` `SUPABASE_SERVICE_ROLE_KEY` `NEXT_PUBLIC_SUPABASE_URL` `NEXT_PUBLIC_SUPABASE_ANON_KEY` `OTA_BUCKET` `RETAIL_OFFLINE_BACKUP_BUCKET` | Vacías, o un proyecto/bucket de staging separado. `service_role` solo en backend |
| Push | `VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Par de claves nuevo, generado para staging |
| Observabilidad | `SENTRY_DSN` `NEXT_PUBLIC_SENTRY_DSN` `SENTRY_ORG` `SENTRY_PROJECT` `SENTRY_RELEASE` `*_TRACES_SAMPLE_RATE` | Vacías, o un proyecto Sentry de staging |
| OTA | `OTA_PUBLISH_TOKEN` `OTA_BUILD_SECRET` `OTA_ADMIN_TOKEN` `OTA_API_URL` `NEXT_PUBLIC_OTA_ENABLED` `CAPACITOR_OTA_DISABLED` | Tokens vacíos; `NEXT_PUBLIC_OTA_ENABLED=false`; no usar el canal `tpv-ota` productivo |
| Antibot | `TURNSTILE_SECRET_KEY` `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Claves de prueba públicas de Cloudflare Turnstile, o vacías |

Además (bloqueo 6): la BD de staging debe ser **nueva y con tenants sintéticos**.
Los tenants pueden guardar en la BD tokens BYOK, claves de pago, impresoras y
webhooks, así que un dump productivo restaurado seguiría cobrando o enviando
mensajes aunque estas variables estén vacías.

## Verificación sugerida antes de arrancar

Sin imprimir valores: comprobar con un script local que cada variable de la
tabla esté vacía o tenga prefijo de prueba (`sk_test_`, etc.) en los `.env`
de la copia y en el shell (`process.env` gana sobre dotenv y Next). Es el paso 5
de "Siguientes pasos" en MARKETPLACE-STAGING.md. No se ejecutó: requiere leer
los `.env`, y AGENTS.md pide no mostrar sus valores.
