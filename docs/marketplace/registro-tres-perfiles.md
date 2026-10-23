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
