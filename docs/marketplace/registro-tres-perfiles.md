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
