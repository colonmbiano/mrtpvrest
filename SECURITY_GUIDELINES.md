# 🛡️ Guía de Seguridad — MRTPVREST

> Guía de referencia y **checklist de revisión** para desarrollar de forma segura en este monorepo.
> Complementa a [`SECURITY_FIXES.md`](./SECURITY_FIXES.md) (registro de vulnerabilidades ya corregidas) y a la sección 7 de [`mrtpvrest_ard.md`](./mrtpvrest_ard.md) (arquitectura de seguridad).

**Aplica a:** `apps/backend`, `apps/tpv`, `apps/admin`, `apps/saas`, y demás apps del workspace.

---

## 0. Principios

1. **El backend es la única autoridad.** Las validaciones de frontend (layouts, middleware de Next.js, `authStore`) son *defensa en profundidad*, nunca el control real. Cada endpoint debe re-validar identidad, rol y tenant.
2. **Multi-tenancy primero.** Toda consulta a datos de negocio debe estar acotada por `restaurantId`/`tenantId`. Un fallo aquí es un IDOR cross-tenant (fuga de datos entre clientes).
3. **Secretos fuera del código.** Nada de claves, PINs por defecto ni passwords hardcodeados. Todo vía variables de entorno.
4. **Fallar cerrado.** Ante duda (sin tenant, sin rol, token inválido) → denegar con 401/403, no continuar.
5. **Resiliencia controlada.** Errores 429/500 de terceros (IA, pagos) se traducen a respuestas 503 controladas (regla del `CLAUDE.md`), nunca filtrar stack traces al cliente.

---

## 1. Autenticación

**Fuente de verdad:** `apps/backend/src/middleware/auth.middleware.js`

- Todo endpoint con datos sensibles **debe** montar `authenticate` antes que cualquier handler.
- `authenticate` verifica la firma JWT (`jwt.verify(token, process.env.JWT_SECRET)`), resuelve el actor (User → Employee → Device) y rechaza usuarios/dispositivos inactivos.
- Soporta tres tipos de actor; respétalos:
  - **User** (humano con cuenta),
  - **Employee** (login por PIN del TPV; `restaurantId`/`tenantId` se resuelven vía `location → restaurant`),
  - **Device** (`payload.isDevice` — KDS/kiosko; el rol viene del payload del token de dispositivo).

### Reglas
- ✅ Nunca confíes en `userId`/`role` que venga del **body** o de **headers** del cliente. Úsalo solo desde `req.user` (poblado por `authenticate`).
- ✅ Los JWT deben tener expiración. Maneja `TOKEN_EXPIRED` en el cliente refrescando, no ampliando el TTL.
- ✅ `JWT_SECRET` y `JWT_REFRESH_SECRET` deben ser largos y aleatorios. Si se filtran, rótalos (invalida todas las sesiones).
- ❌ No agregues rutas nuevas saltándote `authenticate` "temporalmente". Si una ruta es pública, decláralo explícitamente y documéntalo (ver `globalPaths` en `tenant.middleware.js`).

---

## 2. Autorización (RBAC)

**Fuente de verdad:** middlewares `requireAdmin`, `requireSuperAdmin`, `requireRole(...roles)`, `requireTenantAccess`.

```js
// Patrón recomendado en una ruta de escritura sensible:
router.post('/orders/:id/cancel',
  authenticate,
  requireRole('CASHIER', 'ADMIN', 'OWNER', 'MANAGER', 'SUPER_ADMIN'),
  requireTenantAccess,
  handler
);
```

### Reglas
- ✅ **Endpoints de escritura siempre llevan `requireRole`.** Leer la guía de `SECURITY_FIXES.md`: los huecos de KDS se cerraron precisamente por endpoints de escritura sin gate de rol.
- ✅ Usa el rol **más restrictivo** que cumpla la necesidad. No pongas `ADMIN, OWNER, MANAGER` "por si acaso" en un endpoint que solo necesita `OWNER`.
- ✅ Los permisos finos (`canCharge`, `canDiscount`, `canDeleteTickets`, `canManageUsers`, etc.) se definen en `ROLE_DEFAULTS` (`employees.routes.js`). Si un endpoint depende de un permiso específico, valídalo en el backend, no solo ocultes el botón en el front.
- ⚠️ El frontend del TPV valida rol en **layouts** (`(cashier)/layout.tsx`, `(waiter)/layout.tsx`) y en `middleware.ts`. Esto es UX/defensa en profundidad — **no sustituye** el gate del backend.

---

## 3. Multi-tenancy / Prevención de IDOR

**Fuente de verdad:** `apps/backend/src/middleware/tenant.middleware.js` + `requireTenantAccess`.

Este es el riesgo **#1** del producto: que el restaurante A lea/edite datos del restaurante B.

### Reglas
- ✅ **Toda consulta Prisma de negocio incluye `where: { restaurantId }`** (o `tenantId`/`locationId` según el modelo). El filtrado es **manual y explícito por ruta** (patrón WET intencional, ver ARD) — no hay extensión global de Prisma que lo haga por ti.
- ✅ Resuelve el tenant **del servidor**, no del cliente:
  ```js
  const restaurantId = req.restaurantId || req.user?.restaurantId;
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId requerido' });
  ```
  `req.restaurantId` lo puebla `tenant.middleware.js` (headers `x-restaurant-id`/`x-restaurant-slug`, subdominio o JWT).
- ✅ Para operaciones que tocan un recurso de otro tenant potencialmente, monta `requireTenantAccess` (rechaza acceso cruzado; solo `SUPER_ADMIN` cruza tenants).
- ✅ En `UPDATE`/`DELETE` por `id`, **incluye el tenant en el `where`**, no solo el `id`:
  ```js
  // ✅ correcto — si el id es de otro tenant, no afecta filas
  await prisma.order.updateMany({ where: { id, restaurantId }, data });
  // ❌ vulnerable — permite editar pedidos de otro restaurante
  await prisma.order.update({ where: { id }, data });
  ```
- ✅ Valida la **suscripción** del tenant donde aplique (`tenant.middleware.js` revisa `subscription.status`: TRIAL/ACTIVE/SUSPENDED/CANCELLED/EXPIRED). Un tenant SUSPENDED no debe operar.

### Checklist de revisión por cada query nueva
- [ ] ¿Filtra por `restaurantId`/`tenantId`?
- [ ] ¿El `restaurantId` viene de `req` (servidor) y no del body?
- [ ] ¿Los `update/delete` por `id` incluyen el tenant en el `where`?

---

## 4. Login por PIN y fuerza bruta

**Fuente de verdad:** `apps/backend/src/routes/employees.routes.js`

- El PIN es de 4 dígitos (10.000 combinaciones) → **el rate-limit del backend es obligatorio**, no opcional.
- `pinLoginLimiter`: 10 intentos / 15 min por `${ip}:${locationId}`. No lo quites ni lo subas sin justificación.
- El front (`authStore.ts`) también limita (5 intentos → bloqueo de 2 min), pero es **secundario**: un atacante puede saltarse el front.
- ✅ Hashea PINs (bcrypt en DB; SHA-256 para validación offline cacheada). Nunca compares PINs en texto plano.
- ✅ Coerción estricta de booleanos en payloads de empleados (`asBoolOrUndef`): no dejes que `"1"`/`"true"` (string) se conviertan en permisos `true`.

---

## 5. Validación de entrada

**Librería estándar:** **Zod** (`apps/backend/src/schemas/`).

- ✅ Todo body de `POST`/`PUT`/`PATCH` se valida con un schema Zod antes de tocar la DB. Ejemplo de referencia: `schemas/orders.schema.js` (límites de cantidad, precios no negativos, `notes` máx. 500 chars, etc.).
- ✅ Pon **límites superiores** explícitos (longitud de strings, tamaño de arrays, máximos numéricos) para evitar abuso/DoS por payloads gigantes.
- ⚠️ `.passthrough()` se usa para compatibilidad hacia adelante, pero **no metas campos passthrough directamente a Prisma**. Toma solo los campos que esperas (allow-list), nunca hagas `prisma.x.create({ data: req.body })`.
- ✅ Uploads de archivos (Multer): valida tipo MIME y tamaño máximo; no confíes en la extensión del nombre.
- ✅ Prisma parametriza las queries (protege de SQLi). Si alguna vez usas `prisma.$queryRawUnsafe` o `$executeRawUnsafe`, **detente** — usa `$queryRaw` con template tags parametrizados.

---

## 6. Gestión de secretos y claves de IA

**Fuentes:** `apps/backend/src/services/ai-key.service.js`, `apps/backend/src/lib/secret-crypto.js`

- ✅ **BYOK del cliente (Groq):** las API keys de clientes se guardan **cifradas AES-256-GCM** en `Restaurant.aiApiKey` (formato `<ivHex>:<tagHex>:<dataHex>`). Nunca las guardes en claro ni las loguees.
- ✅ La clave de cifrado vive en `AI_ENCRYPTION_KEY` (hex de 64 chars = 32 bytes). Si rota, hay que re-cifrar los secretos existentes.
- ✅ Claves de plataforma (`GROQ_API_KEY`, `GOOGLE_AI_API_KEY`, `STRIPE_SECRET_KEY`, etc.) solo en variables de entorno del backend. **Nunca** en código, en el front, ni en variables `NEXT_PUBLIC_*`.
- ✅ Valida una BYOK contra el proveedor **antes** de cifrar y persistir.
- ❌ Nunca devuelvas una API key (ni descifrada ni cifrada) en una respuesta de API. Como máximo, un flag `hasApiKey: true`.

### Variables `NEXT_PUBLIC_*`
Todo lo que tenga prefijo `NEXT_PUBLIC_` **se expone al navegador**. Solo valores públicos ahí (`NEXT_PUBLIC_API_URL`, branding). Jamás un secreto.

---

## 7. Almacenamiento de credenciales en el cliente (TPV)

**Fuente:** `apps/tpv/src/lib/api.ts`, `apps/tpv/src/store/authStore.ts`

- **Access token** → `sessionStorage` (mejor que `localStorage` frente a XSS persistente).
- **Device token** → `localStorage` (necesario para persistir el setup del dispositivo).
- **`restaurantId`/`locationId`** → `localStorage` (config, no secreto).
- En `401`, el interceptor limpia **solo** las credenciales del empleado, no el setup del dispositivo.
- ✅ Como `localStorage`/`sessionStorage` son accesibles por JS, **la primera defensa contra XSS es no introducir XSS** (ver §8).

---

## 8. Frontend (Next.js / React)

- ✅ Evita `dangerouslySetInnerHTML`. Si es inevitable, sanitiza con una librería (p. ej. DOMPurify) y documéntalo.
- ✅ No construyas URLs de API ni queries concatenando input del usuario sin codificar.
- ✅ El `middleware.ts` del TPV hace RBAC por ruta (`/cierre`, `/pos`, etc.) usando la cookie de rol — recuerda que es **defensa en profundidad**, el backend manda.
- ✅ No metas datos sensibles (tokens, PINs, claves) en logs de cliente, en el estado serializado de Zustand persistido, ni en la URL (query params).

---

## 9. CORS, cabeceras y red

**Fuente:** `apps/backend/src/index.js`

- ✅ El allow-list de CORS cubre `mrtpvrest.com` + subdominios, `*.vercel.app` (solo si `ALLOW_VERCEL_PREVIEWS=true`) y orígenes de dev/móvil. **No agregues `origin: '*'` con `credentials: true`.**
- ✅ Mantén **Helmet** activo (cabeceras de seguridad HTTP).
- ✅ Las conexiones Socket.io usan las mismas reglas CORS + verificación JWT en el handshake. Verifica identidad/tenant también en eventos de socket sensibles, no solo al conectar.
- ✅ `trust proxy 1` está configurado para que el rate-limit lea la IP real detrás del proxy. No lo desactives sin entender el impacto en los limiters.

---

## 10. Webhooks y pagos

- ✅ Verifica la **firma** de los webhooks (Stripe `STRIPE_WEBHOOK_SECRET`, Mercadopago) antes de procesar el evento. Un webhook sin firma válida = descartar.
- ✅ Usa el middleware de **idempotencia** (`Idempotency-Key`) para que reintentos/replays de la cola offline no dupliquen cobros u órdenes.
- ✅ Stripe exige el **body crudo** para verificar la firma — no apliques el parser JSON antes de la verificación en esa ruta.

---

## 11. Logging y manejo de errores

- ✅ Loguea eventos de seguridad: intentos de acceso denegados, fallos de auth (ya hay métricas en `auth-metrics`), rate-limits disparados.
- ❌ **Nunca loguees** PINs, passwords, tokens, API keys ni PII innecesaria.
- ✅ Al cliente devuelve mensajes genéricos (`"Sesión no válida"`), nunca stack traces ni detalles internos. Manda el detalle a Sentry / logs del servidor.
- ✅ Traduce fallos de terceros (IA/pagos 429/500) a `503` controlado (regla 4 del `CLAUDE.md`).

---

## 12. Dependencias y secretos en el repo

- ✅ Activa **Dependabot / `pnpm audit`** en CI para vulnerabilidades de dependencias.
- ✅ Revisa que `.env*` esté en `.gitignore` (lo está). Usa `.env.example` con placeholders, nunca valores reales.
- ⚠️ **Pendiente histórico:** hubo un password en commits previos a 2026-05-03 (ya parametrizado vía env). **Acción recomendada:** rotar ese password en producción y, si es viable, purgar del historial git. Ver nota al final de `SECURITY_FIXES.md`.
- ✅ Antes de commitear, revisa que no se cuele ningún secreto (considera un hook de pre-commit con `gitleaks`/`trufflehog`).

---

## ✅ Checklist rápido para Pull Requests

Antes de aprobar/mergear, verifica:

- [ ] **Auth:** ¿las rutas nuevas con datos sensibles montan `authenticate`?
- [ ] **RBAC:** ¿los endpoints de escritura tienen `requireRole`/`requireAdmin` con el rol mínimo necesario?
- [ ] **Tenant:** ¿toda query filtra por `restaurantId`/`tenantId`? ¿los `update/delete` por `id` incluyen el tenant en el `where`?
- [ ] **Validación:** ¿hay schema Zod para el body? ¿límites superiores en strings/arrays/números?
- [ ] **Sin `prisma.x.create({ data: req.body })`** crudo (allow-list de campos).
- [ ] **Secretos:** ¿nada hardcodeado? ¿ninguna key en `NEXT_PUBLIC_*` ni en respuestas de API?
- [ ] **Errores:** ¿se devuelven mensajes genéricos al cliente, sin stack traces?
- [ ] **Tests:** ¿hay/siguen pasando los E2E de seguridad de roles (`tests/e2e/06-role-security.spec.ts`)?

---

## Pendientes de seguridad conocidos

(Sincronizado con `SECURITY_FIXES.md` — actualízalo al cerrarlos)

- [ ] `Order.waiterEmployeeId` (migración Prisma) para que "Mis mesas" filtre por mesero real.
- [ ] Rotar el password que estuvo en el historial git previo a 2026-05-03.
- [ ] Evaluar 2FA para `OWNER`/`ADMIN` (pausado por scope).
- [ ] Verificar que la **RLS de PostgreSQL** mencionada en el ARD esté efectivamente habilitada como segunda capa, no solo el filtrado por ruta.
- [ ] Añadir escaneo de dependencias (Dependabot/`pnpm audit`) y de secretos (gitleaks) en CI.

---

*Última actualización: 2026-05-31. Mantener junto a `SECURITY_FIXES.md` y la sección 7 de `mrtpvrest_ard.md`.*
