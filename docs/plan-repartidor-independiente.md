# Plan — Repartidor 100% independiente (marketplace)

> Mapa de qué cambiar para convertir la app de repartidores (`apps/delivery`) de
> **vinculada a una sucursal** a una **app de repartidor independiente** (cuenta propia,
> estilo Rappi/Uber), sin romper el flujo híbrido actual.
>
> Fecha: 2026-11-04 · Rama de referencia: `claude/marketplace-app-testing-b578b0`

---

## 1. Veredicto rápido

**No es un proyecto desde cero: ~60–70% del sustrato ya existe en el backend y en el schema.**
Lo que falta es (a) cablear la **identidad** de la app delivery a una cuenta de persona
en vez de a un `Employee` de tienda, (b) el **onboarding/KYC** de cara al repartidor y su
revisión en SaaS, (c) la **liquidación de pagos a la persona** (no a la tienda), y (d) un
**selector de modo** para no romper al repartidor clásico de tienda.

Sigue siendo **1 sola app** (`com.mrtpvrest.delivery`, 1 alta en Play Store). "Independiente"
es un cambio de **modelo de identidad**, no una app nueva.

---

## 2. Dos conceptos de "repartidor" que hoy conviven

| | **Repartidor de tienda (legacy)** | **Courier de red (independiente)** |
|---|---|---|
| Identidad | `Employee` (role driver) | `MarketplaceAccount` → `MarketplaceNetworkCourier` |
| Alcance | 1 `restaurantId` / sucursal | Multi-tienda vía `MarketplaceNetworkAffiliation` |
| Auth en la app | Login admin + elegir sucursal (`SetupScreen`) | Login propio (email+pass, `MarketplaceSession`) |
| Presencia/GPS | `DriverLocation` (tenant) | `MarketplaceNetworkPresence` (por `courierId`) |
| Dispatch | pedidos propios de la sucursal | `MarketplaceNetworkTask/Offer/Assignment` |
| Dinero | `DriverCashMovement/Cut` + `MarketplaceDriverPayout.driverId → Employee` | `MarketplaceLedgerEntry` + `COURIER_PAYABLE` (falta payout a cuenta) |

La app delivery HOY corre como **repartidor de tienda** y usa `driver.id` (Employee) como
`courierId` contra el dispatch. La capa de red es opt-in (`NEXT_PUBLIC_MARKETPLACE_NETWORK_ENABLED`
+ toggle `acceptingShared`).

---

## 3. Qué YA existe (no reconstruir)

**Schema (`packages/database/prisma/schema.prisma`):**
- `MarketplaceAccount` — persona con `email`, `phone`, `city`, `passwordHash`, `emailVerifiedAt`, `disabledAt`.
- `MarketplaceAuthToken` + `MarketplaceSession` — auth propia (sesión 7 días), ya usada por compradores.
- `MarketplaceApplication` — onboarding por `(accountId, role)` con `role ∈ {BUYER, MERCHANT, COURIER}`,
  `status ∈ {PENDING_EMAIL, PENDING_REVIEW, APPROVED, REJECTED, SUSPENDED}`, `deliveryMode`, `vehicle`, `network`, `reviewedByUserId/At`.
- `MarketplaceNetworkCourier { accountId @unique, status, verificationStatus }` — el courier aprobado.
- `MarketplaceNetworkAffiliation { courierId, merchantId, restaurantId, status }` — courier ↔ comercios (N:M).
- `MarketplaceNetworkPresence / Offer / Assignment / Task / Trip` — dispatch keyed por `courierId`.
- `MarketplaceLedgerEntry`, `MarketplaceFinanceOutbox`, balance `COURIER_PAYABLE`.

**Backend (`apps/backend/src/lib/`):**
- `marketplace-identity.js` — register/verifyEmail/sesión para BUYER/MERCHANT/COURIER. ⚠️ Comentario: *"in production only buyer accounts"* → courier/merchant **gateados**.
- `marketplace-couriers-v1.js` — servicio courier: `apply`, `profile`, `affiliations`, `affiliate`, `revoke`, `requireCourier`, catálogo `VEHICLES`.
- `marketplace-dispatch.js`, `marketplace-multistop.js`, `marketplace-network-prisma.js` — motor de dispatch (CAS, ofertas, multi-stop).
- `marketplace-driver-balance.js`, `marketplace-driver-payouts.js`, `marketplace-ledger.js` — dinero.

**App delivery (`apps/delivery/src/lib/`):**
- `marketplaceDispatch.ts` — cliente de red: presencia+GPS, ofertas, aceptar (CAS 409), PIN pickup/entrega.
- `marketplaceNetwork.ts`, `marketplaceMultiStop.ts`, `storeDeliveryPin.ts`.
- `HomeScreen.tsx` ya tiene pestañas **🏪 Mi Tienda** vs **🌐 Red Marketplace**.

**SaaS (`apps/saas/app/(dashboard)/marketplace/`):**
- `MerchantApplicationsSection`, `DispatchAuditSection`, overview con balance `COURIER_PAYABLE`.

---

## 4. Qué sigue acoplado a la tienda (los gaps reales)

1. **Identidad de la app** — `apps/delivery` solo sabe autenticar como `Employee` + sucursal
   (`SetupScreen`: login admin → elegir sucursal). No hay pantalla de **login/registro de courier**
   contra `MarketplaceSession`. `courierId` = `Employee.id`.
2. **Onboarding/KYC de cara al repartidor** — existe `MarketplaceApplication` (COURIER) y
   `verificationStatus`, pero NO hay UI en la app para registrarse, verificar email, subir
   documentos/vehículo, ni pantalla de "pendiente de aprobación".
3. **Revisión de couriers en SaaS** — hay `MerchantApplicationsSection`; falta la equivalente
   **CourierApplicationsSection** (aprobar/rechazar/suspender → crea `MarketplaceNetworkCourier`).
4. **Pago a la persona** — `MarketplaceDriverPayout.driverId → Employee` (scoped a `restaurantId`).
   Un courier-cuenta no tiene ruta de payout; el dinero liquida a un Employee de tienda.
5. **Gate de producción** — `marketplace-identity.js` solo habilita cuentas BUYER en prod;
   COURIER está apagado. Falta flag/rollout.
6. **Afiliación visible** — `affiliate/revoke` existen en backend; falta UI (app: "unirme a esta tienda";
   SaaS/tienda: "aceptar repartidor").

---

## 5. El mapa de cambios por capa

### A. Backend (`apps/backend`)
- [x] **Habilitar identidad COURIER en prod** detrás de flag — **HECHO (Fase 0).**
      `marketplace-identity-mount.js` ahora amplía los roles de producción con
      `MARKETPLACE_IDENTITY_EXTRA_ROLES` (lista opt-in, p. ej. `COURIER` o `MERCHANT,COURIER`).
      BUYER siempre; valores desconocidos se ignoran (fail-closed); sin la variable, cero cambio.
- [x] **Router courier v1** expuesto — **YA EXISTÍA.** `marketplace-couriers-v1.routes` montado en
      `index.js:185` (`/api/marketplace/v1/couriers/apply|me/profile|me/affiliations`, `/merchants/:id/couriers/affiliate`).
      Se cablea con `MARKETPLACE_NETWORK_ENABLED=true` (sin ella, inerte, solo fixtures).
- [x] **Dispatch acepta `courierId` de `MarketplaceNetworkCourier`** (no Employee) — **YA EXISTÍA.**
      `marketplace-dispatch.routes.js:87-96` resuelve el actor por `MarketplaceSession`
      (`createNetworkActorResolver`) → `MarketplaceNetworkCourier` por `accountId`, con guard
      `status==='ACTIVE'` + `verificationStatus==='VERIFIED'`.
- [ ] **Payout a cuenta**: nueva tabla/relación `MarketplaceCourierPayout { accountId … }` **o** hacer
      `MarketplaceDriverPayout.driverId` polimórfico (Employee | Account). Decisión abierta (ver §7).
      Conectar a `COURIER_PAYABLE` del ledger y a `MarketplaceFinanceOutbox`.
- [ ] **Multi-tenancy**: el courier es cross-tenant → sus lookups de identidad van en `runWithBypass`
      (como el login de usuario), igual que `auth.middleware.js`. `MarketplaceNetworkCourier` NO lleva
      `restaurantId`, así que no entra a `SCOPED_MODELS`; las tablas de red que sí lo llevan, sí.

### B. SaaS (`apps/saas`)
- [ ] **CourierApplicationsSection** (espejo de `MerchantApplicationsSection`): listar aplicaciones
      COURIER, ver KYC, aprobar → crea `MarketplaceNetworkCourier` (`verificationStatus=VERIFIED`), rechazar/suspender.
- [ ] **Pagos a repartidores**: pantalla que consuma `COURIER_PAYABLE` y dispare payouts a cuenta.
- [ ] Control del dueño: aceptar/revocar afiliaciones de couriers a su tienda.

### C. App delivery (`apps/delivery`) — el grueso del trabajo de UI
- [ ] **Selector de modo en arranque**: "Soy repartidor de una tienda" (flujo actual) vs
      "Soy repartidor independiente" (nuevo). Persistir elección.
- [ ] **Registro/login de courier** contra `marketplace-identity`: email+contraseña, verificación de email,
      recuperación. Guardar sesión en `token-vault` (no `localStorage` directo — ver reglas APK).
- [ ] **Onboarding/KYC**: formulario (vehículo, ciudad, docs) → `apply`; pantalla "pendiente de aprobación"
      mientras `status != APPROVED`.
- [ ] **Afiliaciones**: UI "unirme a tiendas de la red" / ver mis comercios (`affiliations`, `affiliate`).
- [ ] **Identidad de dispatch**: cuando el modo es independiente, `courierId` = `MarketplaceNetworkCourier.id`
      (de la sesión), no `driver.id`. En `HomeScreen` ocultar la pestaña 🏪 Mi Tienda (no aplica).
- [ ] **Ganancias/billetera**: pantalla de saldo y liquidaciones del courier (no la caja de tienda actual).
- [ ] **Capacitor/Keystore**: sin cambios de firma; respetar https-only y `token-vault.ts`.

### D. App cliente (`apps/client`)
- [ ] Sin cambios estructurales. A lo sumo: tracking ya soporta pedidos de red (`MarketplaceTrackingMap`).

---

## 6. Modelo de identidad objetivo

```
MarketplaceAccount (persona)
  ├─ sessions: MarketplaceSession        ← login de la app delivery (modo independiente)
  ├─ applications: MarketplaceApplication (role=COURIER, status=APPROVED)
  └─ courier: MarketplaceNetworkCourier (accountId @unique, verificationStatus)
        └─ affiliations: MarketplaceNetworkAffiliation (→ muchos merchants/tiendas)
              └─ dispatch: NetworkOffer → NetworkAssignment → NetworkPresence/Trip
                    └─ dinero: MarketplaceLedgerEntry (COURIER_PAYABLE) → Payout a la cuenta
```

El **repartidor de tienda (Employee)** se conserva en paralelo; la app elige camino por el selector de modo.

---

## 7. Decisiones abiertas (requieren tu visión de producto)

1. **¿Coexistencia o reemplazo?** ¿La misma persona puede ser Employee-driver de una tienda *y*
   courier independiente? Recomendado: **coexistir** (menos ruptura), con selector de modo.
2. **Payout**: ¿tabla nueva `MarketplaceCourierPayout(accountId)` o hacer `driverId` polimórfico?
   Recomendado: **tabla nueva** (evita migración riesgosa de FK y mantiene limpio el guard tenant).
3. **KYC**: ¿verificación manual (SaaS aprueba) o integrar un proveedor? Fase 1: manual.
4. **Comisión/tarifa del courier independiente**: ¿la fija la red (global) o por tienda? Impacta `settlement` en `MarketplaceOrderPipeline`.
5. **iOS**: si se publica también en App Store, +1 alta (no afecta este plan de identidad).

---

## 8. Fases sugeridas

- **Fase 0 — Cablear lo que existe: ✅ HECHA (backend).** El router courier v1, el dispatch por sesión
  y la cadena apply→approve→affiliate→dispatch **ya existían**; el único gap de código era el gate de
  roles de producción, ahora resuelto con `MARKETPLACE_IDENTITY_EXTRA_ROLES` (opt-in, back-compat).
  **Para encender el flujo courier end-to-end en un entorno** (sin UI nueva todavía):
  `MARKETPLACE_IDENTITY_ENABLED=true` + `MARKETPLACE_IDENTITY_MODE=production` +
  `MARKETPLACE_IDENTITY_EXTRA_ROLES=COURIER` + `MARKETPLACE_NETWORK_ENABLED=true`
  (más los secretos ya exigidos: RESEND, Turnstile, origin same-site, `MARKETPLACE_BUYER_JWT_SECRET`).
  Verificación de couriers (PENDING_VERIFICATION→VERIFIED): `POST /api/marketplace/v1/ops/couriers/:id/approve`.
- **Fase 1 — Onboarding (en curso).**
  - [x] **SaaS `CourierApplicationsSection`** — lista y aprueba/rechaza solicitudes COURIER (`/identity/admin/applications`).
  - [x] **Sesión del APK resuelta** — el APK es Capacitor (`https://localhost`, cross-site), así que NO puede usar la
    cookie same-site. Se agregó el contexto JWT `courier` (`MARKETPLACE_COURIER_JWT_SECRET`, aud
    `mrtpvrest-marketplace-courier`), un **password grant** `POST /api/marketplace/identity/courier/token`
    (exento del check de Origin; exige perfil COURIER aprobado; TTL 24 h) y el camino **Bearer de courier** en
    el resolver de red y en el dispatch (`marketplace-courier-identity.js`), que llega al mismo guard
    `NetworkCourier` ACTIVE/VERIFIED. Tests: `marketplace-courier-identity.test.cjs` + `authenticateCourier`.
  - [x] **App delivery — entrada + login courier.** SetupScreen tiene "Soy repartidor independiente" →
    `CourierAuthScreen` (login contra `/identity/courier/token`), `lib/courierSession.ts` guarda el Bearer
    (`deliveryMode='courier'`, TTL respetado), bootstrap reabre `CourierHomeScreen` si hay sesión. El ALTA
    se hace en la web (mrtpvrest.com/registro): el APK no puede `/register` (Origin + captcha). Verificado en
    la ventana (3006): login envía a la API y degrada con gracia (404 = identidad apagada en prod).
  - [x] **Fase 2 — tablero de despacho en modo courier.** `lib/api` inyecta el Bearer de courier cuando
    `deliveryMode==='courier'` (sin headers de tienda) y limpia la sesión en 401. `CourierHomeScreen` es ahora
    el tablero real: perfil (`/couriers/me/profile`) + gate de verificación, presencia+GPS (`updateCourierPresence`),
    ofertas (reusa `MarketplaceOffers`, aceptar con CAS) y PIN de recolección/entrega. Verificado en la ventana
    (3006): monta, pide perfil y degrada con gracia. tsc OK.
  - [x] **Página web de registro COURIER.** `apps/client/registro?tipo=repartidor` (con cuentas activas)
    renderiza `CourierSignup` real: nombre/correo/teléfono/ciudad + selects de vehículo y modalidad de red +
    Turnstile, POST a `/identity/register` rol COURIER (`registerCourier`). Reusa el kit AccountUi (+ nuevo
    `SelectField`) y la validación de `marketplace-registration`. Requiere `NEXT_PUBLIC_MARKETPLACE_ACCOUNTS=true`
    (y `NEXT_PUBLIC_TURNSTILE_SITE_KEY` para el captcha). Verificado en la ventana (3003): render + validación OK.
  - [x] **Reconciliación de modelos de courier.** `couriers-v1` ahora usa el mismo vocabulario de vehículo que
    el registro/identidad (`MOTO/BICYCLE/CAR/WALK`, antes `MOTO/BICI/AUTO`) y la **placa es opcional** (se
    completa en la verificación KYC), para que aprobar un registro pueda provisionar el `NetworkCourier` sin
    re-capturar datos. Tests actualizados (61/61 en couriers-v1/dispatch/identity).
  - [ ] **Puente de provisión** (siguiente): al aprobar la solicitud COURIER en SaaS, crear el `NetworkCourier`
    (PENDING_VERIFICATION) desde la solicitud (nombre/correo/teléfono de la cuenta + vehículo de la aplicación),
    vía la persistencia de red. Luego ops verifica (VERIFIED) y el repartidor ya despacha.
  - [ ] **Pendiente**: prueba end-to-end real (encender flags de identidad/red + aprobar/verificar un courier).
- **Fase 2 — Operación:** selector de modo, afiliaciones, dispatch con `courierId` de red, billetera.
- **Fase 3 — Dinero:** payout a cuenta + conciliación con `COURIER_PAYABLE` + outbox.
- **Fase 4 — Rollout:** quitar flag, documentar, (opcional) alta iOS.

---

## 9. Archivos ancla (para arrancar)

- Schema: `packages/database/prisma/schema.prisma` (modelos `MarketplaceNetwork*`, `MarketplaceAccount`, `MarketplaceApplication`, `MarketplaceDriverPayout`).
- Backend: `apps/backend/src/lib/marketplace-{identity,couriers-v1,dispatch,driver-payouts,ledger}.js`, montaje en `apps/backend/src/index.js`.
- Delivery: `apps/delivery/src/components/delivery/screens/{SetupScreen,HomeScreen,CourierDashboard}.tsx`, `apps/delivery/src/lib/{marketplaceDispatch,marketplaceNetwork}.ts`.
- SaaS: `apps/saas/app/(dashboard)/marketplace/{MerchantApplicationsSection,DispatchAuditSection}.tsx`, `apps/saas/lib/marketplaceOverview.ts`.
