# Auditoría de abuso de endpoints (bots / registro masivo / fuerza bruta / costo IA)

**Fecha:** 2026-06-25
**Disparador:** captura de un script PowerShell registrando ~100 tenants en bucle
contra `POST /api/auth/register-tenant` con `userNNNN@example.com`, obteniendo
tokens cada vez. Mismo patrón que metió ~72 tenants basura (commit `9448841`).

Esta auditoría barrió **toda la superficie de este tipo de ataque** en
`apps/backend`: endpoints públicos, cobertura de rate-limit, amplificación de
costo en IA, y defensas existentes. Lo implementado aquí NO debe regresionarse.

---

## Hallazgos y estado

### 🔴 ALTO — corregido

| # | Vector | Archivo | Fix |
|---|--------|---------|-----|
| 1 | **Bypass del anti-bot vía aliasing de Gmail.** La denylist solo miraba el dominio; `colon+1@gmail.com`, `c.o.l.o.n@gmail.com` son la misma bandeja Gmail (no desechable) y evadían `emailTaken` + la auto-purga. Mismo abuso, otra puerta. | `lib/email-domains.js`, `routes/auth.routes.js`, `routes/store.routes.js` | `normalizeEmail()` canonicaliza Gmail (`+tag` y puntos) y subdirecciones de proveedores que entregan al mismo inbox. Registro y login de tenant **y** de cliente almacenan/consultan el canónico. Login con fallback a la forma cruda para cuentas legacy (sin regresión). |
| 2 | **Fuerza bruta de PIN de repartidor.** `POST /api/delivery/login` (PIN 4 dígitos) sin limiter propio **y** `/api/delivery/` está excluido del rate-limit global → cero throttle. | `routes/delivery.routes.js` | `driverLoginLimiter`: 10 intentos / 15 min por IP. |
| 3 | **Turnstile fallaba *abierto* sin la key.** En prod, si `TURNSTILE_SECRET_KEY` no estaba configurada, la capa CAPTCHA quedaba apagada en silencio. | `lib/turnstile.js` | En `NODE_ENV==='production'` falla **cerrado** (rechaza) salvo opt-out explícito `TURNSTILE_OPTIONAL=true`. Dev sigue omitiendo. |

### 🟠 MEDIO — corregido

| # | Vector | Archivo | Fix |
|---|--------|---------|-----|
| 4 | **Creación masiva de órdenes online.** `POST /api/store/orders` con source ONLINE solo tenía el global (2000/15min); el cap estricto era solo para KIOSK. | `lib/rate-limiters.js`, `routes/store.routes.js` | `storeOrderLimiter`: 30 / 10 min por IP. Omite staff autenticado (TPV), KIOSK (cap propio) y el bridge de WhatsApp. |
| 5 | **Login/registro de cliente sin límite propio.** Vector de cuentas-bot y fuerza bruta de credenciales de clientes. | `lib/rate-limiters.js`, `routes/store.routes.js` | `customerRegisterLimiter` (5/h IP) y `customerLoginLimiter` (15/15min IP). |
| 6 | **Sin cap por tenant en IA.** `aiLimiter` es por IP; un atacante tras NAT/proxy rotativo podía drenar cuota de Groq/Gemini. | `lib/rate-limiters.js`, `routes/ai.routes.js` | `aiTenantLimiter`: backstop de 120/min **por restaurante** (degrada a IP). Aplicado tras `requireTenantAccess` en las 6 rutas de IA. |

### 🟢 BAJO / ya mitigado (sin cambio)

- **`saas-ai/agent` sin rate-limit** (`saas-ai.routes.js`): requiere `requireSuperAdmin` → escenario insider, no externo. Un subagente lo marcó "crítico" incorrectamente.
- **`devices/auth`**: sin limiter, pero el deviceToken es hex de alta entropía → fuerza bruta inviable.
- **Campañas WhatsApp**: el subagente reportó `limit` ilimitado; **falso** — `remarketing.service.js:67` ya hace `Math.min(2000, limit)`.
- **Auto-purga** (`jobs/unverifiedPurge.job.js`): bien diseñada (48h sin verificar, protege tenants con órdenes). Único riesgo residual: borra setup legítimo que tarda >48h sin órdenes.
- **Slugs reservados** sin denylist, pero el `UNIQUE` de BD evita colisión real.

---

## Pendiente / recomendado (no implementado aquí)

- **Account lockout** por cuenta (no solo por IP) tras N intentos de login.
- **Política de password** (complejidad/diccionario), hoy solo `length >= 8`.
- **Límites de recursos por plan** (máx restaurantes/usuarios por tenant).
- **Migrar rate-limits in-memory a Redis** si Railway escala a multi-instancia (`parseRate`, `kioskRate`, y todos los `express-rate-limit` son por-proceso).
- Considerar `normalizedEmail` como columna con índice si se quiere dedup a nivel BD (requiere migración con el flujo manual de `prisma migrate deploy`).

## Acción operativa requerida

Confirmar que **`TURNSTILE_SECRET_KEY`** está configurada en el entorno del
backend en Railway. Con el fix #3, su ausencia en producción ahora **bloquea el
registro** (fail-closed). Si por alguna razón se quiere desplegar sin la key,
setear `TURNSTILE_OPTIONAL=true` de forma explícita.
