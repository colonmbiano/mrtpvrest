# Runbook — Primeras pruebas del repartidor independiente

Cómo encender el flujo del repartidor independiente en un entorno y hacer la primera
prueba real de punta a punta. El código ya está (PR #190); esto es **configuración +
pasos de prueba**. Mapa y diseño: `docs/plan-repartidor-independiente.md`.

> Recomendación: probar primero en **staging** (o un entorno de prueba) antes de prod.
> Encender la identidad del marketplace NO cambia nada hasta que se setean las variables;
> si falta alguna requerida, la identidad simplemente **no se monta** (se loguea el motivo).

---

## 1. Variables de entorno

### Backend (Railway)
| Variable | Valor | Para qué |
|---|---|---|
| `MARKETPLACE_IDENTITY_ENABLED` | `true` | Monta `/api/marketplace/identity`. |
| `MARKETPLACE_IDENTITY_MODE` | `production` | Modo productivo (vs `staging` aislado). |
| `MARKETPLACE_IDENTITY_EXTRA_ROLES` | `COURIER` | Habilita registro/aprobación de repartidores (BUYER siempre). |
| `MARKETPLACE_NETWORK_ENABLED` | `true` | Cablea dispatch, afiliaciones y la **provisión al aprobar**. |
| `MARKETPLACE_IDENTITY_ORIGIN` | `https://mercaditocolorines.mrtpvrest.com` | Origen same-site del registro (debe ser `*.mrtpvrest.com`). |
| `RESEND_API_KEY` | *(secreto)* | Correo de verificación. |
| `TURNSTILE_SECRET_KEY` | *(secreto)* | Captcha del registro. |
| `MARKETPLACE_BUYER_JWT_SECRET` | *(32+ bytes, ≠ `JWT_SECRET`)* | Token de comprador (ya usado). |
| `MARKETPLACE_COURIER_JWT_SECRET` | *(32+ bytes, ≠ `JWT_SECRET`)* | **Nuevo**: token Bearer del APK del repartidor. |

Generar secretos: `openssl rand -base64 48`.

### Cliente / marketplace (Vercel — mercaditocolorines)
| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_MARKETPLACE_ACCOUNTS` | `true` |
| `NEXT_PUBLIC_MARKETPLACE_CATALOG` | `true` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | *(clave pública Turnstile)* |
| `NEXT_PUBLIC_API_URL` | `https://api.mrtpvrest.com` |

### App delivery (Vercel/APK)
| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.mrtpvrest.com` |

### SaaS
Sin cambios: ya autentica como `SUPER_ADMIN`.

---

## 2. Flujo de prueba (paso a paso)

1. **Registro.** Abre `https://mercaditocolorines.mrtpvrest.com/registro?tipo=repartidor`,
   llena nombre/correo/teléfono/ciudad + vehículo + modalidad + contraseña, resuelve el
   captcha y pulsa **Crear cuenta de repartidor**. Debe aparecer "Revisa tu correo".
2. **Verificar correo.** Abre el enlace que llega por Resend (desde el mismo dispositivo).
3. **Aprobar en SaaS.** Entra al panel SaaS → **/marketplace** → sección **Repartidores de la
   red** → el solicitante aparece en *Pendientes* → **Aprobar**. Al aprobar, el backend
   **provisiona el `MarketplaceNetworkCourier`** en estado `PENDING_VERIFICATION`.
4. **(Opcional) Login temprano.** En la app delivery → **Soy repartidor independiente** →
   inicia sesión con el correo/contraseña. Debe entrar y mostrar **"Cuenta en revisión"**
   (todavía no verificado, no despacha).
5. **Verificar en la red (ops).** Marca el courier como `VERIFIED`:
   - Obtén el `courierId`:
     ```sql
     SELECT id FROM marketplace_network_couriers
     WHERE "accountId" = (SELECT id FROM marketplace_accounts WHERE email = 'correo@del.repartidor');
     ```
   - Llama al endpoint de ops con el **token de SUPER_ADMIN del SaaS** (Authorization: Bearer):
     ```bash
     curl -X POST "https://api.mrtpvrest.com/api/marketplace/v1/ops/couriers/<courierId>/approve" \
       -H "Authorization: Bearer <token-super-admin-saas>" -H "Content-Type: application/json" -d '{}'
     ```
6. **Despacho.** Vuelve a la app → ahora debe decir **"Verificado"** → **Conectarme a la red**
   (acepta permiso de GPS) → aparecen ofertas → **Aceptar** → ingresa el **PIN de recolección**
   y luego el **PIN de entrega**.

---

## 3. Qué verificar en cada hito

- [ ] Llega el correo de verificación (Resend).
- [ ] La solicitud aparece y se aprueba en SaaS.
- [ ] Se crea el `MarketplaceNetworkCourier` (PENDING_VERIFICATION) al aprobar.
- [ ] El login del repartidor funciona en la app; muestra "en revisión" hasta verificar.
- [ ] Tras el `ops approve` → el perfil pasa a "Verificado" y aparece el tablero de ofertas.

---

## 4. Notas y limitaciones conocidas

- **Sin botón "Verificar" en SaaS todavía**: el paso 5 usa el endpoint de ops (se puede
  agregar un botón al panel después; requiere exponer el `courierId` en la lista de solicitudes).
- **Reintento de provisión**: si al aprobar falla la provisión (red caída, etc.), la solicitud
  queda `PENDING_REVIEW` y se puede volver a aprobar (la provisión es idempotente).
- **Token del APK**: dura 24 h; al expirar el repartidor vuelve a iniciar sesión (401 → login).
- **Alta solo por web**: el APK no puede registrar (Origin same-site + captcha); solo inicia sesión.
- **`couriers-v1 apply`** (segundo onboarding desde la app) queda como alternativa; con este flujo
  no hace falta — el repartidor no re-captura datos.
