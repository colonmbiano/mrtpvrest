# Prompt para Claude Code — Fix de bugs detectados en QA del TPV

Eres un dev senior trabajando en **MRTPVREST** (Next.js 14 App Router + Capacitor + Supabase + Prisma + Express). El stack y las reglas están en `/CLAUDE.md` (no las repitas, pero respétalas).

Acabo de hacer un QA manual exhaustivo del TPV en una Blackview Tab 8 WiFi (API 32) corriendo el APK `apps/tpv/android/app/build/outputs/apk/debug/app-debug.apk`. El user logueado durante la prueba: Eduardo Alejandro Gutierrez Gómez (ADMIN), sucursal "Master burguers / PRINCIPAL".

Encontré **13 bugs y 4 duplicados aclarados**. Tu tarea: arreglarlos en orden de prioridad. Para cada uno:

1. Localiza el código exacto con `Grep`/`Glob` antes de editar (no inventes paths).
2. Implementa el fix **completo** (sin placeholders — regla del CLAUDE.md).
3. Verifica que no rompes flujos adyacentes.
4. Resume qué cambiaste y en qué archivos.

---

## P0 — BLOQUEANTE ABSOLUTO (cobro roto, hacer ANTES que nada)

### BUG-14: COBRAR TICKET crashea WebView con "page couldn't load"
- **Síntoma reproducido al 100%:** añadir 1 producto a un ticket Para Llevar o Domicilio → click en COBRAR TICKET → WebView muestra "This page couldn't load — Reload/Back". Imposible cobrar nada desde la tablet.
- **Diagnóstico exacto (de Logcat 15:35:42):**
  ```
  E Capacitor: Unable to open asset URL:
     https://localhost/meseros/mis-mesas/__next.meseros.mis-mesas.txt?_rsc=...
  E Capacitor: Unable to open asset URL:
     https://localhost/meseros/__next.meseros.__PAGE__.txt?_rsc=...
  ```
  8 errores consecutivos sobre archivos RSC (React Server Components) de la ruta `/meseros/mis-mesas` y `/meseros/__PAGE__`.
- **Causa raíz:** El handler de COBRAR TICKET navega (probablemente `<Link href="/meseros/...">` con prefetch o `router.push`) a una ruta bajo `apps/tpv/src/app/meseros/...` que NO está en el bundle estático generado por `next build && next export` del APK Capacitor. Next.js App Router intenta prefetchear el RSC payload, Capacitor lo busca en el localhost interno, no existe, dispara error boundary → "page couldn't load".
- **Solución esperada (en este orden, parar al primero que funcione):**
  1. **`<Link prefetch={false}>`** en el botón COBRAR TICKET y en cualquier `<Link>` que apunte a rutas bajo `/meseros/`. Esto evita el prefetch de RSC y deja la navegación cliente normal.
  2. Si la ruta `/meseros/mis-mesas` (o la ruta exacta a la que va COBRAR) tiene segmentos dinámicos (`[id]`, `[ticketId]`), añadir `generateStaticParams` que devuelva las opciones conocidas, o eliminar el segmento dinámico si no es necesario.
  3. Verificar `apps/tpv/next.config.js` que tenga `output: 'export'`. Si no, los RSC se generan como server-only y no se incluyen en el bundle estático.
  4. **Mejor solución estructural:** **el cobro debería ser un modal en la misma ruta**, no una navegación a otra page. Refactor: extraer el componente del checkout a un Dialog/Modal en `apps/tpv/src/app/(comanda)/page.tsx`. Esto evita el problema de routing+RSC con Capacitor para siempre.
- **Acceptance:** añadir producto → COBRAR TICKET → modal de cobro abre sin crash, permite elegir método de pago y confirmar.
- **Side effect del fix:** una vez COBRAR funcione, también hay que validar que **el cierre de turno** (Corte de Caja → "Confirmar y Cerrar Turno") no caiga en el mismo problema. Hay un turno abierto hace 92h en producción que probablemente sea por este bug.

### BUG-15: Sin recovery del ticket tras crash
- **Síntoma:** tras el crash de BUG-14, click en Reload → vuelve a Panel de Operación, pierde el ticket en curso.
- **Esperado:** persistir tickets en localStorage (key por `restaurant_id` + `cajero_id` + ticket número) tras cada add/remove de producto. Al cargar la pantalla de orden, restaurar borradores no cobrados.
- **Acceptance:** crear ticket con 3 productos → forzar reload de la WebView → al volver, el ticket sigue ahí.

---

## P0bis — Seguridad (después de cobro, no avanzar a P1 hasta confirmar)

### BUG-3: Configuración admin sin PIN — ✅ RESUELTO (2026-05-10)
- **Síntoma:** Cualquiera con la tablet en mano hace click en "Configuración" del Panel Operación y entra directo a Panel Central sin autenticación adicional.
- **Esperado:** modal de PIN que valida contra empleados con `rol=ADMIN` antes de navegar.
- **Fix aplicado:**
  - Nuevo `apps/tpv/src/components/AdminPinGuardModal.tsx` — valida PIN contra empleados con rol `ADMIN`/`OWNER` activos del restaurante (lookup en `useAuthStore.employees` con hash SHA256, offline-friendly).
  - `apps/tpv/src/app/pos/order-type/page.tsx`: `goConfig` ahora abre el modal si el rol actual no es ADMIN/OWNER; ADMIN/OWNER entran directo sin fricción.
  - `apps/tpv/src/app/pos/menu/layout.tsx` (avatar header): MANAGER ya no entra directo (antes sí); ahora MANAGER/CASHIER pasan por el modal.
  - Cada acceso se registra en `useOfflineStore.queue` con `type: 'override'`, `data.permission = 'access_admin_panel'` — insumo listo para la bitácora del BUG-13.
- **Acceptance:** ✅ click en "Configuración" → modal PIN → solo navega si PIN coincide con un empleado ADMIN/OWNER del `restaurant_id` actual.

### BUG-5: Cambio de PIN sin verificación
- **Síntoma:** Desde Configuración → Personal → Editar Empleado, el campo "CAMBIAR PIN DE ACCESO" cambia el PIN de cualquier empleado (incluido ADMIN) sin re-autenticar al admin actual.
- **Esperado:** al modificar el campo PIN y antes del PATCH al backend, pedir el PIN actual del admin logueado para confirmar.
- **Acceptance:** modificar PIN → modal "Confirma con tu PIN admin" → si OK envía PATCH; si KO bloquea.

### BUG-13: Bitácora de auditoría vacía
- **Síntoma:** Configuración → Seguridad → "Bitácora de Acceso — Últimos 50 eventos" muestra "Sin eventos registrados aún" pese a uso activo (vimos $3,670 en Dashboard).
- **Esperado:** logging real de eventos: login, logout, cambios de admin, ediciones de empleados, cambios de precios, anulaciones.
- **Acción probable:**
  - Backend: revisar si existe tabla `audit_log` en Prisma. Si no, añadirla. Si sí, ver por qué no se está poblando.
  - Endpoint `GET /api/audit-log/recent?limit=50` devolviendo eventos del `restaurant_id` actual.
  - Frontend ya tiene la sección, conecta al endpoint.
- **Acceptance:** tras un login, aparece un evento "LOGIN" en la bitácora con timestamp + user_id.

---

## P1 — Bugs UI / UX

### BUG-4: Overlay residual de modal de mesas
- **Síntoma:** tras cerrar modal de "Comer Aquí" con la X, el siguiente click sobre otra card del Panel Operación es ignorado. Click en zona vacía libera el bloqueo.
- **Causa probable:** el backdrop del modal mantiene `pointer-events:auto` o el portal no se desmonta. Es un Headless UI / Radix / portal custom.
- **Acción:** en el componente del modal de selección de mesa, asegurar cleanup correcto (`useEffect` return, o key/condition que fuerce unmount).

### BUG-6: Avatar sidebar no es interactivo
- **Síntoma:** la "E" ámbar del sidebar de Configuración no responde a clicks.
- **Acción:** añadir `onClick` que abra dropdown con: nombre completo + rol + botón "Cerrar sesión".

### BUG-7: Iconos semánticamente confusos
- **Síntoma:** el icono ⚙️ (universalmente "Settings") en el sidebar abre **Catálogo de Productos**, no Settings.
- **Acción:** sustituir el engranaje por un icono de menu/book/restaurant para Catálogo. Mantener gear solo para opciones de sistema reales.

### BUG-8: Productos $0 inflan ranking "Top Productos"
- **Síntoma:** "Aderezo Extra" ($0.00) aparece en el ranking del Dashboard. Si el ranking es por unidades vendidas, sesga; si es por revenue, debería excluirse.
- **Acción:** en el query del top products (probablemente `apps/backend/src/routes/analytics/*` o `app/api/analytics/*`), filtrar `price > 0` O cambiar la métrica a `SUM(price * qty)` en lugar de `SUM(qty)`. Si quieres ambas vistas, expón un toggle "Por unidades / Por ingreso".

### BUG-9: Breadcrumbs inconsistentes en Configuración
- **Síntoma:** cada sub-pantalla muestra categoría distinta arriba: GESTIÓN ADMINISTRATIVA, OPERACIÓN, RECURSOS HUMANOS, ANALYTICS, ENRUTAMIENTO, INFRAESTRUCTURA, ADMINISTRACIÓN, PERSONALIZACIÓN.
- **Acción:** unificar. Sugerencia: todos como `Configuración › <Sección>` con el mismo estilo, o eliminar la categoría de arriba y dejar solo el título grande.

### BUG-10: "Red e Impresión" vs "Red e Impresoras"
- **Síntoma:** la card del Panel Central dice "Red e Impresión" pero el título de la pantalla dice "Red e Impresoras".
- **Acción:** unificar a "Red e Impresoras" en ambos sitios.

### BUG-11: Naming case caótico
- **Síntoma:** nombres mezclados — "Grupo cocina", "bebidas", "Tacos", "Las clasicas", "SUPER HAMBURGUESAS", "ALITAS Y BONELESS", "Volcanes", "Las angys".
- **Acción:** crear util `formatDisplayName(str)` en `packages/shared/utils/` que aplique Title Case consistente. Aplicar al render de impresoras, grupos, categorías. NO modificar los datos en BD — solo capa de presentación.

### BUG-12: "Ciberseguridad" vs "Seguridad"
- **Síntoma:** card del Panel Central dice "Ciberseguridad", el título de la pantalla dice "Seguridad".
- **Acción:** unificar a "Seguridad".

### Permisos truncados en modal de empleado
- **Síntoma:** títulos de permisos cortados con "..." — "Anular producto...", "Aplicar descuen...", "Reabrir cuentas ...", "Gestionar otros ...".
- **Acción:** ampliar ancho del card de permiso o usar `Tooltip` con texto completo. Mejor: meter el título corto + descripción debajo sin truncar.

### Preview Ticket muestra dirección hardcoded
- **Síntoma:** en Configurador de Tickets el campo "Dirección" del form está vacío pero el preview muestra "Av. Principal 123" hardcoded. Si imprimes así, ¿qué sale?
- **Acción:** vincular preview al estado real del form. Si el campo está vacío, el preview debe mostrar la línea vacía o ocultarla.

---

## P2 — Mejoras

### Bug `[object Object]` en logs de Capacitor
- **Síntoma:** Logcat se llena de `Capacitor/Console: File: - Line 349 - Msg: [object Object]`. Spam masivo durante uso normal.
- **Causa:** alguien llama `console.log(obj)` sin stringify en algún hook/interceptor.
- **Acción:** `Grep -n "console.log"` en `apps/tpv/src/`. La línea 349 está en algún archivo grande — busca interceptors HTTP, hooks de Capacitor, o utilities. Sustituir por `console.log(JSON.stringify(obj, null, 2))` o eliminar si era debug residual.

### UX: usuario logueado siempre visible
- **Síntoma:** el nombre del user solo aparece en la pantalla de orden, no en Panel Operación ni Configuración.
- **Acción:** mover el bloque "Eduardo Alejandro Gutierrez Gómez / TURNO ACTIVO / E avatar" a un layout/header global persistente.

### Tipo de Letra dropdown truncado
- **Síntoma:** en Configurador de Tickets el dropdown "Tipo de Letra" muestra "Monospace (Tip..)" cortado.
- **Acción:** ampliar el ancho del select.

### Inconsistencia visual del botón "Guardar"
- **Síntoma:** en Pagos e Impuestos el botón "Guardar cambios" es outlined; en otras pantallas es ámbar sólido.
- **Acción:** unificar el estilo del CTA primario.

---

## Duplicados aclarados (NO son bugs, solo confirmación)
- Personal vs Seguridad: complementarios (quién tiene PIN vs cuándo se pide).
- Red e Impresoras vs Grupos de Impresoras: complementarios (dispositivos vs enrutamiento).
- Sidebar 11 iconos vs 10 cards: el icono extra es "Home de Configuración", no duplicado de Dashboard.
- Mapa de Mesas vs Mesas y Zonas: PENDIENTE — no llegué a probar Mapa de Mesas. Verifica que no muestren la misma vista.

---

## Restricciones (CLAUDE.md)
- Sin placeholders. Código completo y listo para producción.
- camelCase para variables, PascalCase para componentes.
- Multi-tenancy: filtrar todas las queries por `restaurant_id`.
- Resiliencia: errores 429/500 → respuesta 503 controlada.
- Git: push directo a `master` está permitido en este repo.

## Cómo trabajar
1. **Empieza por BUG-14** (cobro roto, bloqueante absoluto del producto). Hazme primero un `Grep -rn "COBRAR TICKET\|cobrar\|/meseros/mis-mesas"` en `apps/tpv/src` para localizar el botón y la ruta destino, y muéstrame el código actual del handler antes de proponer el fix. Quiero entender si es Link, router.push, o un modal mal montado.
2. No pases al siguiente bug hasta que confirme el fix anterior con un OK.
3. Si encuentras un fix que ataca varios bugs a la vez (ej: un Layout global que arregla user logueado + breadcrumbs + estilos del CTA), agrúpalos y dilo.
4. Para cualquier ambigüedad, pregúntame antes de inventar.
5. Tras cada fix, dame `git diff` y un commit message sugerido en español.

¿Por dónde empezamos?
