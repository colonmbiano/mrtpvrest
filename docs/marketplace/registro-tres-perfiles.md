# MRTPVREST Marketplace — registro por perfiles (primera entrega)

Rama: `feature/marketplace-hibrido`
Fecha: 2026-10-23
Alcance actual: frontend de demostración y reglas locales de validación. **No hay registros persistidos ni llamadas API de alta.**

## Flujos

| Tipo | Ruta inicial | Formulario fase 1 | Identidad definitiva prevista |
| --- | --- | --- | --- |
| Negocio | `/registro?tipo=negocio` | Nombre comercial, persona responsable, correo, teléfono, localidad, giro, red propia/compartida | Tenant+Restaurant existentes + aprobación para publicar en Marketplace |
| Cliente | `/registro?tipo=cliente` | Nombre, correo, teléfono, localidad | Cuenta global de comprador con direcciones y pedidos multi-tienda |
| Repartidor | `/registro?tipo=repartidor` | Nombre, correo, teléfono, localidad, vehículo, modalidad | Perfil de courier global con aprobación y vínculos a negocios/red compartida |

El cliente puede elegir rol, validar campos y revisar un resumen local en RAM.
No se solicitan claves, fotos de documentos, CLABE, geolocalización ni pagos.
No existe un botón que finja haber creado una cuenta. El prototipo no envía solicitudes de red, no usa `localStorage` y no registra datos personales en archivos de log.

## Compatibilidad con el MRTPVREST existente

- **Negocios:** `POST /api/auth/register-tenant` ya crea Tenant, Restaurant, suscripción y administrador del SaaS. No replicar esa transacción en Marketplace, ni auto-registrar un tenant al hacer clic en el prototipo. Futuro flujo: dar de alta el negocio por la ruta canónica de onboarding con Turnstile, correo verificado y aprobación para el directorio.
- **Clientes:** `POST /api/store/customer/register` y `CustomerAuth` del client son cuentas **por tienda**. Nunca tratar esos JWT como credenciales de la cuenta global. Agregar entidad separada de `MarketplaceBuyer` (o relación robusta) y vinculación explícita a cada tienda, respetando privacidad y lealtad por negocio.
- **Repartidores:** `Employee(role=DELIVERY)` es específico de sucursales. No convertir empleados de una tienda en repartidores públicos por default. Agregar identidad global de `MarketplaceCourier` + afiliaciones consentidas, zonas, aprobación y cuenta de pagos.
- **Catálogo:** hoy su publicación depende de `MARKETPLACE_STORE_SLUGS` hasta 100. Alta de un tenant no debe convertirlo automáticamente en tienda visible. Pendiente una tabla `MarketplaceMerchantMembership` con `PENDING/APPROVED/SUSPENDED` y privilegios administrados por SuperAdmin.
- **Preview:** solo `VERCEL_ENV=preview` y `VERCEL_GIT_COMMIT_REF=feature/marketplace-hibrido` activa la demostración. `/registro` se redirige a `/` si el catálogo está apagado, sin afectar tiendas y URLs legacy.

## Fase 2: contratos y seguridad (pendiente)

1. Diseñar migración `MarketplaceIdentity` (email único normalizado) y perfiles tipo BUYER / MERCHANT_OWNER / COURIER, más las tablas de solicitudes, afiliaciones y auditoría. Evitar que el usuario elija privilegios elevados por payload. Respetar `Tenant` existente.
2. Validar correo mediante enlace de un solo uso; contraseña bcrypt/argon2 o passkey según proveedor elegido. Sesión con cookie HttpOnly+Secure+SameSite, rotación de sesiones, revocación, CSRF si hay cookie y protección de bots/rate limit distribuido. No guardar token permanente en localStorage.
3. Endpoints propuestos (aún **no implementados**):
   - `POST /api/marketplace/identity/register` — inicio de registro de comprador.
   - `POST /api/marketplace/identity/verify-email` — confirmar correo.
   - `POST /api/marketplace/merchants/apply` — solicitud de asociación/publicación; propietarios autenticados.
   - `POST /api/marketplace/couriers/apply` — solicitud de repartidor, estados y consentimiento.
   - `GET /api/marketplace/account/me` — datos minimizados del usuario autenticado.
   - `GET/PATCH /api/saas/marketplace/applications` — moderación SuperAdmin.
4. Negocios: verificar titular, giro, sucursales, cobertura, cuenta de dispersión con proveedor y habilitar publicación **solo tras revisión**. No permitir cobrar en Marketplace mientras falte integridad del flujo de pagos.
5. Repartidores: documentos y comprobantes solo cuando el módulo seguro de verificación exista; control de acceso por perfil; GPS únicamente si está en servicio; aceptación de términos, privacidad y autorización de datos.
6. Compradores: cuenta global, direcciones, pedidos por negocio, datos opcionales, derecho de eliminación/consentimiento, auditoría de acceso y protección contra la exposición entre tenants.
7. Pruebas sobre PostgreSQL aislado con varios roles y abusos negativos: duplicados, carreras, fuerza bruta, acceso cruzado y revisiones fraudulentas; después pruebas E2E antes de producción.

## Fase 3

Conectar el frontend real a los endpoints completos únicamente en un ambiente staging separado, con flag explícito. La revisión del formulario nunca debe transformarse silenciosamente en un POST a la API de producción. Finalmente activar por fases y medir abandono de registro, verificaciones, aprobaciones y primera compra/entrega.


---

## Fase 2, entrega de backend (23/oct/2026)

**Se implementó código y se añadieron las tablas en ambos schemas de Prisma** sin ejecutar migraciones en producción ni habilitar registros públicos.

Migración pendiente de aplicar únicamente en staging:
`packages/database/prisma/migrations/20261023000000_marketplace_identity/migration.sql`.

Tablas independientes:

- `marketplace_accounts`: identidad global, correo único normalizado, hash bcrypt, estado de verificación.
- `marketplace_applications`: perfil BUYER, MERCHANT o COURIER, aprobación individual y auditoría de SuperAdmin.
- `marketplace_auth_tokens`: tokens de correo y restablecimiento almacenados solo como SHA-256, de un solo uso, con caducidad.
- `marketplace_sessions`: sesión aleatoria de 256 bits, solo hash en base, revocable y expira en siete días.

No se modifican `Tenant`, `Restaurant`, `User`, `Customer` ni `Employee`.
Un perfil aprobado no publica ningún negocio, no habilita repartidores, no permite cobrar ni crea suscripciones.

### Endpoints implementados (apagados por defecto)

Base: `/api/marketplace/identity`.

| Método | Ruta | Contrato |
| --- | --- | --- |
| POST | `/register` | Registro por `role`: BUYER, MERCHANT, COURIER; requiere clave 12–128 caracteres y CAPTCHA; respuesta genérica 202 |
| POST | `/verify-email` | Token de 64 hex (en el body), de un solo uso |
| POST | `/resend-verification` | Respuesta genérica 202; CAPTCHA y limitador |
| POST | `/login` | Sesión HttpOnly Secure SameSite=Strict, no retorna token en JSON |
| GET | `/me` | Información mínima de identidad y perfiles del titular |
| POST | `/logout` | Revoca el token y elimina cookie |
| POST | `/password/forgot` | Envío genérico de recuperación con CAPTCHA |
| POST | `/password/reset` | Token y contraseña nueva; revoca todas las sesiones |
| POST | `/applications` | Solicitud de MERCHANT o COURIER por usuario verificado |
| GET | `/admin/applications?status=PENDING_REVIEW` | Listado solo con JWT de SUPER_ADMIN SaaS |
| POST | `/admin/applications/:id/decision` | APPROVED/REJECTED, validación SUPER_ADMIN y estado pendiente |

Seguridad implementada: no retorno de secretos ni tokens de verificación en la API, hash y expiración, anti-enumeración de cuentas, bloqueo de orígenes para operaciones mutables, rate limit por IP para staging, Turnstile, confirmación de correo y cookies host-only.
Los enlaces de correo usan fragmentos `#token=…` para no incluir tokens en registros HTTP; faltan las vistas que consumen ese fragmento.

### Activación con varias barreras (solo staging)

**NO establecer estas variables en producción** ni mezclar con bases reales.

```dotenv
# Predeterminado: apagado. Configuración de prueba, no activar sin preparar staging.
MARKETPLACE_IDENTITY_ENABLED=false
MARKETPLACE_IDENTITY_MODE=staging
MARKETPLACE_IDENTITY_ORIGIN=https://marketplace-staging.example.invalid
# Requiere DATABASE_URL/DIRECT_URL a BD AISLADA cuyo nombre contenga marketplace...staging.
# Requiere RESEND_API_KEY y TURNSTILE_SECRET_KEY exclusivos de staging.
```

El proceso solo monta estas rutas con `MARKETPLACE_IDENTITY_ENABLED=true`, `MARKETPLACE_IDENTITY_MODE=staging`, URL PostgreSQL con nombre de BD que incluya `marketplace` y `staging`, correo y CAPTCHA configurados, y origen HTTPS.
No cambiar la bandera hasta aprovisionar esa base e integrar las vistas y correos.

### Pendientes para permitir altas reales

1. Ejecutar revisión formal y migración SQL **solo en PostgreSQL de staging** (sin dumps/secretos reales); verificar índices, rollback y aislamiento.
2. Añadir el origen web único / proxy de API en staging, para que la cookie strict funcione en el mismo dominio y el CAPTCHA esté disponible.
3. Conectar los tres formularios al API mediante flag distinto del preview de demostración; solicitar contraseña y confirmarla, y pantallas que consuman verificación/restablecimiento sin dejar tokens en URL HTTP.
4. Probar E2E en navegador, correo Resend sandbox, caducidad, concurrencia, recuperación, rate limiting distribuido y aprobación de solicitudes por SuperAdmin.
5. Elaborar el alta canónica real de comerciantes (vinculación a Tenant/Restaurant ya existentes, verificación de titular, contrato), y dar de alta repartidores globales sin permitirles acceder a pedidos de otras tiendas por solo estar registrados.
6. Política legal de privacidad, consentimiento, tratamiento de documentos y validación de identidad; no solicitar archivos sensibles hasta tener almacenamiento y ACL seguros.
7. Desplegar progresivamente detrás de feature flags con métricas de fallos, idempotencia y alertas.

### Evidencia de CI

`.github/workflows/ci-backend.yml` incluye `node --test apps/backend/scripts/marketplace-identity.test.cjs`.
La suite prueba validación de roles, correos, hashes, verificación, sesiones, logout, reset, solicitudes, aprobación y seguridad de rutas con Express/supertest y almacenamiento simulado.
El CI backend genera Prisma y ejecuta Jest aparte; **no son pruebas de una migración ni un flujo HTTP contra PostgreSQL real**.

---

## Producción: cuenta del comprador (app del cliente)

Primer paso de la app del cliente (PWA y luego Android). La misma identidad global (`marketplace_accounts`, ya migrada) puede montarse en producción **solo para compradores**. Sigue apagada por defecto.

### Activación

```dotenv
MARKETPLACE_IDENTITY_ENABLED=true
MARKETPLACE_IDENTITY_MODE=production
# Origen exacto de la tienda donde vive el marketplace: https, sin ruta, bajo mrtpvrest.com.
MARKETPLACE_IDENTITY_ORIGIN=https://<marketplace>.mrtpvrest.com
# Correo de verificación y recuperación, y CAPTCHA del registro.
RESEND_API_KEY=...
TURNSTILE_SECRET_KEY=...
# Clave propia del token de comprador: 32+ bytes, distinta de JWT_SECRET y JWT_REFRESH_SECRET.
MARKETPLACE_BUYER_JWT_SECRET=...
```

Si falta alguna variable, o no es válida, la ruta **no se monta** y el backend sigue arrancando. El log de error dice `[marketplace-identity] no montada en modo production` con los nombres de las variables, nunca sus valores. El modo staging conserva sus barreras y detiene el arranque si está mal configurado (`lib/marketplace-identity-mount.js`).

En producción:
- `/register` solo acepta `role: 'BUYER'`.
- `/applications` (negocio o repartidor) no existe.
- El resto de las rutas son las de la tabla de arriba.

### Emisor del token de comprador

| Método | Ruta | Contrato |
| --- | --- | --- |
| POST | `/token` | Con la sesión por cookie y el `Origin` exacto. Requiere el perfil BUYER aprobado (se aprueba al verificar el correo). Devuelve `{ token, tokenType: 'Bearer', expiresIn: 900 }`, sin caché. |

- El token es un JWT HS256 con `MARKETPLACE_BUYER_JWT_SECRET`, emisor `mrtpvrest-marketplace`, destinatario `mrtpvrest-marketplace-buyer` y `{ accountId, role: 'BUYER' }`. Dura 15 minutos.
- Es el token que ya aceptan las APIs v1 de direcciones, cotización, orden y seguimiento (`lib/marketplace-buyer-identity.js`). La tienda no lo acepta.
- La sesión nunca sale en JSON: solo viaja en la cookie `__Host-mrtpv_market` (HttpOnly, Secure, SameSite=Strict). Sin clave dedicada, `/token` responde 503 y nunca firma con `JWT_SECRET`.
- Límite: 60 tokens por IP cada 15 minutos.

### Contrato para la tienda (PR 2)

- La tienda (`*.mrtpvrest.com`) llama directo a `api.mrtpvrest.com` con `credentials: 'include'`. Son del mismo sitio, así que la cookie Strict viaja, y CORS ya admite `*.mrtpvrest.com` con credenciales. No hace falta proxy.
- Pide `/token` al entrar y unos minutos antes de que venza, y lo manda como `Authorization: Bearer` a `/api/marketplace/v1/*`.
- Los correos enlazan a `/registro/verificar#token=…` y `/registro/restablecer#token=…`. Esas pantallas tienen que existir antes de encender la bandera.
- Los limitadores viven en memoria de cada proceso del backend. Con más de una réplica, cada una cuenta por su lado.

### Tienda: cuenta y direcciones (PR 2)

Variables de la tienda (`apps/client`, requieren rebuild en Vercel):

```dotenv
NEXT_PUBLIC_MARKETPLACE_CATALOG=true
NEXT_PUBLIC_MARKETPLACE_ACCOUNTS=true
NEXT_PUBLIC_API_URL=https://api.mrtpvrest.com
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...   # par público de TURNSTILE_SECRET_KEY
```

| Ruta | Qué hace |
| --- | --- |
| `/registro?tipo=cliente` | Registro real del cliente, con contraseña y captcha. Negocio y repartidor siguen siendo la demostración. |
| `/registro/verificar#token=…` | Verifica el correo y borra el token de la barra de direcciones. |
| `/registro/restablecer#token=…` | Contraseña nueva; cierra todas las sesiones. |
| `/cuenta/entrar` | Entrar, recuperar contraseña (`?olvide=1`) y reenviar verificación (`?reenviar=1`). `?next=` solo acepta rutas internas. |
| `/cuenta` | Datos del cliente, sus direcciones (quitar) y cerrar sesión. Sin sesión lleva a entrar. |

- Con sesión abierta, la cotización, la orden y la libreta v1 viajan con `Authorization: Bearer` y quedan en la cuenta. Sin sesión siguen como invitado de ese navegador (`lib/marketplaceAccount.ts`, `getBuyerToken`).
- El token se guarda solo en memoria, nunca en `localStorage`. Se renueva un minuto antes de vencer.
- Las direcciones se agregan al pedir a domicilio, donde está el mapa para marcar el punto.
- **Dominio:** el `middleware` de la tienda reescribe cualquier subdominio que no sea de sistema a `/<subdominio>`. Hoy solo pasan tal cual `mrtpvrest.com`, `www` y los demás hosts de sistema. Antes de encender, el marketplace tiene que vivir en uno de ellos, o el `middleware` tiene que conocer su host. `MARKETPLACE_IDENTITY_ORIGIN` debe ser ese origen exacto.
- **Pruebas:** `tests/client/account.spec.ts` corre contra `tests/client/mock-account.mjs` (`pnpm test:client` ejecuta las dos configuraciones). Cubre registro y validación, verificación (válida, inválida y ya usada), entrada, Mi cuenta con la libreta vía Bearer, quitar una dirección, salida, recuperación de contraseña y `?next` interno. Desde el PR 5 cubre también los avisos, con un service worker de mentira: activar, apagar, dar de baja al salir, permiso bloqueado y sin service worker. Desde el PR 6 cubre la app instalable (ver abajo). Corre en móvil y en escritorio.

### Mis pedidos y seguimiento (PR 3)

Todo exige el token de comprador (`Authorization: Bearer`). Un id de invitado (`X-Buyer-Id`) no da historial ni sigue pedidos: vive en un navegador y no prueba nada más. Los pedidos de la cuenta son los que se crearon con su token desde el PR 2.

| Método | Ruta | Contrato |
| --- | --- | --- |
| GET | `/api/marketplace/v1/orders?limit=&before=` | Pedidos de la cuenta en todas las tiendas, del más reciente al más viejo. Salen de las cotizaciones de la cuenta que ya son orden. Página de hasta 50; `before` es la fecha de `nextBefore`. Devuelve tienda, número, estado, total, fecha, cómo se entrega y productos, **nunca** PIN, dirección, teléfono ni token de rastreo. |
| GET | `/api/marketplace/v1/orders/:id/codes` | Códigos de recoger y entregar de un pedido **activo** de la cuenta: los mismos que devolvió la orden, derivados de la clave y comprobados contra sus hashes. Entregado o cancelado responde 409 `ORDER_CLOSED`; otra cuenta, 404. |
| GET | `/api/marketplace/v1/orders/:id/tracking` | Además del token de rastreo de la orden, acepta el Bearer de la cuenta dueña (la de su cotización). Mismas comprobaciones de orden, tienda, sucursal y vigencia (14 días); con token de rastreo se ignora la cuenta. |

En la tienda, `/cuenta/pedidos` (enlazada desde Mi cuenta) lista los pedidos y deja seguir los activos con el modal de siempre: estado, mapa del repartidor y código, pedido al abrirlo y guardado solo en memoria.

### Favoritas y volver a pedir (PR 4)

| Método | Ruta | Contrato |
| --- | --- | --- |
| GET | `/api/marketplace/v1/favorites` | Tiendas favoritas de la cuenta (Bearer): slug, nombre, logo, si está abierta y desde cuándo. Solo las que siguen publicadas en el marketplace, con el mismo criterio del directorio. |
| PUT | `/api/marketplace/v1/favorites/:slug` | Guarda una tienda publicada. Es idempotente: 201 la primera vez y 200 después. Una tienda no publicada responde 404; con 100 favoritas, 409 `FAVORITES_LIMIT`. |
| DELETE | `/api/marketplace/v1/favorites/:slug` | La quita, aunque ya no esté publicada (204). |

- **Datos:** la tabla `marketplace_favorites` (migración `20261102000000_marketplace_favorites`) guarda `accountId` y `merchantId`, con la llave foránea a `restaurants` en cascada. Es del comprador, no del comercio: no lleva `restaurantId` ni entra al tenant-guard.
- **En la tienda:**
  - Con las cuentas encendidas, la barra del marketplace de cada tienda tiene «Guardar» o «Favorita». Sin sesión, lleva a entrar y vuelve a la tienda.
  - Mi cuenta muestra «Mis tiendas favoritas», con enlace a cada una y la opción de quitarla.
- **Volver a pedir:** sale en Mis pedidos para los pedidos entregados o cancelados. Abre la tienda con el enlace de carrito que ya existía (`?cart=`, solo ids y cantidades). El precio y la disponibilidad salen del menú vigente, y lo que ya no existe queda fuera.

### Avisos push del pedido (PR 5)

| Método | Ruta | Contrato |
| --- | --- | --- |
| PUT | `/api/marketplace/v1/push` | Suscribe este navegador a los avisos de la cuenta (Bearer). Cuerpo `{ subscription }`, el `toJSON()` de `PushSubscription`. El endpoint tiene que ser https, sin usuario ni contraseña y de hasta 1000 caracteres, y las llaves base64url. Si otro dueño tenía ese endpoint, pasa a esta cuenta. |
| DELETE | `/api/marketplace/v1/push` | Da de baja `{ endpoint }`, solo si es de esta cuenta (204). |

- **Datos:** usa la tabla `push_subscriptions` que ya existía, con `userId = buyer:<accountId>`. No hace falta migración. El `/api/notifications/subscribe` de la tienda no pide sesión, así que no sirve para la cuenta y no se toca.
- **Cuándo avisa:** `notifyOrderStatus`, en cada cambio de estado de un pedido con `source = MARKETPLACE`, busca la cuenta en su cotización. Los invitados (`guest:`) no reciben avisos. El aviso lleva el número y el estado, nunca códigos ni dirección, y abre `/cuenta/pedidos`. Si el aviso falla, el cambio de estado sigue igual.
- **Requisitos:** `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` en el backend; sin ellas no se manda nada. `VAPID_EMAIL` es el contacto del remitente. También `MARKETPLACE_V1_ORDERS_ENABLED`; sin ella, 503 `PUSH_UNAVAILABLE`.
- **En la tienda:**
  - `worker/index.js` es el worker propio que next-pwa compila a `public/worker-<id>.js` y carga desde `sw.js`. Muestra el aviso y, al tocarlo, abre su enlace, solo del mismo origen.
  - Mi cuenta tiene «Avisos de tus pedidos» para activarlos o apagarlos en este dispositivo.
  - Cerrar sesión da de baja este navegador.
  - Sin service worker (desarrollo, copia aislada o vista previa) explica que los avisos son de la app publicada.
  - En iPhone solo funcionan con el sitio agregado a la pantalla de inicio.

### App instalable del marketplace (PR 6)

- **Service worker:** hasta este PR, `/sw.js` nunca se registraba en producción, y sin él no había modo sin conexión ni avisos del PR 5. Había dos fallas:
  - next-pwa 5.6 solo inyecta su registro en el entry del Pages Router (`main.js`), que el App Router no carga. Ahora lo registra `components/ServiceWorkerRegister.tsx`, montado en la portada, `/cuenta/*` y `/registro/*`. Con scope `/` cubre todo el origen. `next.config.mjs` pasa `register: false` y expone `NEXT_PUBLIC_PWA_ENABLED`, que es `false` en desarrollo, en la copia aislada y en la vista previa, donde no hay `/sw.js`.
  - La página de respaldo `/_offline` vivía en `app/_offline`. Una carpeta con `_` es privada en el App Router y no genera ruta, así que `/_offline` respondía 404, la precarga fallaba y el service worker se desinstalaba. Ahora vive en `app/%5Foffline`. Sus chunks llevan un `%` literal en el nombre, y `manifestTransforms` lo escapa para que la URL de la precarga apunte al archivo correcto.
- **Avisos:** `marketplacePush` espera hasta 15 s a que el worker esté activo, porque suscribirse lo pide; en la primera visita todavía está instalando. Sin `/sw.js` responde enseguida.
- **Manifiesto:** `/marketplace.webmanifest` (`app/marketplace.webmanifest/route.ts`, estático):
  - Abre en `/`, en modo `standalone`, con íconos `any` y `maskable`.
  - Con las cuentas encendidas tiene atajos a Mis pedidos y Mi cuenta.
  - Sin catálogo responde 404.
  - Solo lo enlazan la portada, `/cuenta/*` y `/registro/*` (`lib/marketplaceApp.ts`, junto con el ícono de Apple). No es `app/manifest.ts` porque Next lo enlazaría también en las páginas de cada tienda.
- **Íconos:**
  - `public/icons/*.svg` se convierten a PNG con `node scripts/generate-icons.mjs` (con el `sharp` de Next). Ver `public/icons/README.md`.
  - También se generan los de respaldo de las tiendas (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`), que `lib/tenant.ts` ya pedía y no existían.
  - El `.gitignore` de la raíz ignora `*.png`; se agregó la excepción `apps/client/public/icons/*.png`.
- **Instalar:**
  - En la portada, «Instalar app» aparece en la cabecera cuando el navegador lanza `beforeinstallprompt` (Chrome, Edge, Samsung Internet).
  - En Mi cuenta, «Instala la app» ofrece el mismo botón. En iPhone y iPad explica Compartir → «Agregar a inicio».
  - Ya instalada no aparece.
- **Sin conexión:** `/_offline` dice que las páginas ya abiertas siguen disponibles y ofrece «Reintentar».
- **Subdominios de tienda:** el `middleware` reescribe a `/<slug>` también `/sw.js`, `/icons/*` y `/marketplace.webmanifest`, así que en un subdominio que no es de sistema no hay service worker. Ya pasaba antes de este PR. El marketplace tiene que vivir en un host de sistema (ver **Dominio** arriba).
- **Pruebas:**
  - `tests/client/account.spec.ts` (las que empiezan con «app:») cubre:
    - el manifiesto, sus íconos (tipo y tamaño reales del PNG) y que las tiendas no lo enlazan;
    - que `/_offline` existe;
    - el botón de instalar, con un `beforeinstallprompt` simulado;
    - las instrucciones en iPhone, y que instalada no insiste.
  - Con `next build` y `next start` locales contra la API simulada, en Chromium:
    - el worker se activa y la precarga incluye `/_offline` y los íconos;
    - sin red, una página nunca abierta muestra `/_offline` y la portada ya abierta sale de la caché;
    - Mi cuenta encuentra el worker.
  - Lo que no se probó: la suscripción push real, porque el Chromium sin ventana bloquea las notificaciones.

### App Android (PR 7)

`apps/client/android` es una Trusted Web Activity: abre la PWA del PR 6 en Chrome a pantalla completa. No lleva una copia del sitio, así que la sesión, el modo sin conexión y los avisos son los de la web. Cómo compilarla y publicarla está en `apps/client/android/README.md`.

- **Por qué TWA y no Capacitor:** el WebView de Capacitor no recibe avisos web, así que haría falta push nativo con Firebase (proyecto, `google-services.json` y una cuenta de servicio en el backend), y nada de eso existe todavía. En la TWA, Chrome delega los avisos web del PR 5 en la app (`DelegationService`) y salen con su nombre y su ícono. En Android 13 o más nuevo, la app pide el permiso.
- **URL:** sale de `marketplaceUrl` al compilar, porque el dominio todavía no se decide. Tiene que ser un origen https, sin puerto ni ruta; para probar con `adb reverse` se acepta `http://localhost`.
- **Digital Asset Links:**
  - La tienda sirve `/.well-known/assetlinks.json` con el paquete `com.mrtpvrest.marketplace` y las huellas de `MARKETPLACE_ANDROID_CERT_SHA256`: la de firma de Play y la de subida, separadas por comas. Descarta las huellas mal formadas.
  - Sin huellas, o sin catálogo, responde 404, y la app abre como pestaña de Chrome, con la barra de dirección.
  - La app declara el sitio en `asset_statements` y recibe los enlaces `https://<dominio>` (`autoVerify`).
- **Firma:** usa las mismas variables que el TPV y el repartidor (`KEYSTORE_PATH`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`). Sin llave, el release queda sin firmar.
- **Íconos:** el ícono adaptable, la pantalla de inicio y el ícono de los avisos se generan con `scripts/generate-icons.mjs`, que ahora también escribe en `android/app/src/main/res`.
- **Fuera de este PR:** los atajos en el ícono de Android (Mis pedidos, Mi cuenta). La PWA ya los tiene en su manifiesto.
- **Pruebas:**
  - `account.spec.ts` comprueba que `assetlinks.json` declara el paquete y solo las huellas válidas.
  - `./gradlew assembleDebug assembleRelease` compila; el release pasa R8 y el lint de release. En el APK, `asset_statements` es JSON válido y el filtro de enlaces usa el host configurado.
  - En un emulador (Android 16, Chrome 145) contra `next build` y `next start` locales, con la verificación de Digital Asset Links desactivada para ese origen mediante una opción de prueba de Chrome:
    - la app abre la tienda a pantalla completa, con la barra de estado de la marca;
    - la página se ve como instalada (`display-mode: standalone`), la controla el service worker y su `referrer` es `android-app://com.mrtpvrest.marketplace/`;
    - Mi cuenta ofrece «Activar avisos» y no muestra «Instala la app».
  - **Sin verificar:** que los avisos salgan a nombre de la app. Con `http://127.0.0.1`, Chrome pidió el permiso él mismo en vez de delegarlo; la delegación necesita el dominio real en https con `assetlinks.json`. Tampoco se probó la verificación real de Digital Asset Links, que necesita ese dominio y la llave de firma.

### Evidencia

`apps/backend/scripts/marketplace-identity.test.cjs` (`node --test`, en el CI del backend) cubre:
- Las reglas de montaje: apagada, staging, producción completa e incompleta, origen ajeno o con ruta, y clave corta o igual a la de la tienda.
- Que producción no acepta negocio ni repartidor.
- Que `/token` exige sesión viva y `Origin` exacto, que el verificador v1 acepta su token y la tienda no, que no sirve como cookie, que se corta al cerrar sesión, que exige perfil de comprador y que sin clave responde 503.

Con almacenamiento simulado; sin PostgreSQL, correo ni navegador reales.
