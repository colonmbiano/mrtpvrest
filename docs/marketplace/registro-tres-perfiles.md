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
- **Pruebas:** `tests/client/account.spec.ts` corre contra `tests/client/mock-account.mjs` (`pnpm test:client` ejecuta las dos configuraciones). Cubre registro y validación, verificación (válida, inválida y ya usada), entrada, Mi cuenta con la libreta vía Bearer, quitar una dirección, salida, recuperación de contraseña y `?next` interno. Corre en móvil y en escritorio.

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

### Evidencia

`apps/backend/scripts/marketplace-identity.test.cjs` (`node --test`, en el CI del backend) cubre:
- Las reglas de montaje: apagada, staging, producción completa e incompleta, origen ajeno o con ruta, y clave corta o igual a la de la tienda.
- Que producción no acepta negocio ni repartidor.
- Que `/token` exige sesión viva y `Origin` exacto, que el verificador v1 acepta su token y la tienda no, que no sirve como cookie, que se corta al cerrar sesión, que exige perfil de comprador y que sin clave responde 503.

Con almacenamiento simulado; sin PostgreSQL, correo ni navegador reales.
