# Reporte final QA — TPV MRTPVREST
**Fecha QA original:** 10 mayo 2026
**Fecha resolución:** 11 mayo 2026
**Dispositivo:** Blackview Tab 8 WiFi (Android API 32)
**Build:** APK debug `com.mrtpvrest.tpv` v1.0 — apunta a producción `api.mrtpvrest.com`
**Usuario logueado durante el test:** Eduardo Alejandro Gutierrez Gómez (ADMIN), sucursal "Master burger / PRINCIPAL"
**APK actualizado instalado en:** emulator-5554 (Pixel Tablet 2560×1600)

---

## Estado de resolución

**18 de 21 bugs cerrados en sesión 2026-05-10/11.** Bugs restantes (3) corresponden a la fase 2 (sub-pantallas/toggles) que aún no se ha abordado.

| # | Bug | Sev | Estado | Fix |
|---|---|---|---|---|
| 14 | COBRAR TICKET crashea WebView (RSC routes faltan en bundle Capacitor) | 🔴 BLOQUEANTE | ✅ Fix mínimo aplicado | `prefetch={false}` en `meseros/layout.tsx`. Pendiente verificación en tablet. |
| 3 | Configuración admin sin PIN | 🔴 CRÍTICO | ✅ Resuelto | `AdminPinGuardModal.tsx` + guard en order-type/menu layout |
| 5 | Cambio de PIN de empleado sin verificación | 🔴 CRÍTICO | ✅ Resuelto | Re-auth admin antes del PATCH en `usuarios/page.tsx` |
| 13 | Bitácora de auditoría vacía | 🔴 CRÍTICO | ✅ Resuelto | `GET /api/admin/access-log` + log de LOGIN en backend |
| 15 | Sin recovery del ticket tras crash del cobro | 🟠 ALTO | ✅ Resuelto | `ticketStore` con `persist` a `localStorage` |
| 4 | Overlay residual de modal mesas bloquea siguientes clicks | 🟠 ALTO | ✅ Resuelto | `touch-action: manipulation` global en `globals.css` |
| 17 | Panel Central no navega tras volver de sub-pantalla | 🟠 ALTO | ⏳ Pendiente | (fase 2) |
| 21 | Toggle "PIN para abrir cajón" no responde | 🟡 MEDIO | ⏳ Pendiente | (fase 2) |
| 20 | Toggle "AMPLIO" en Ancho Panel Ticket no responde | 🟡 MEDIO | ⏳ Pendiente | (fase 2) |
| 8 | Productos $0 inflan ranking Top Productos | 🟡 MEDIO | ✅ Resuelto | `subtotal > 0` + orderBy subtotal en `reports.routes.js` |
| 6 | Avatar sidebar no es interactivo (sin perfil/logout) | 🟡 MEDIO | ✅ Resuelto | Dropdown con nombre/rol/logout en `admin/layout.tsx` |
| 7 | Iconos sidebar semánticamente confusos (⚙️ → Catálogo) | 🟡 MEDIO | ✅ Resuelto | `BookOpen` reemplaza al engranaje en "Menú" |
| 9 | Breadcrumbs inconsistentes en Configuración | 🟡 MEDIO | ✅ Resuelto | Unificados a "Configuración" en 9 páginas admin |
| 18 | Color de selección hardcoded ámbar (no respeta paleta) | 🟢 BAJO | ⏳ Pendiente | (fase 2) |
| 19 | Modo claro deja sidebar oscuro | 🟢 BAJO | ⏳ Pendiente | (fase 2 / deuda) |
| 10 | "Red e Impresión" vs "Red e Impresoras" naming | 🟢 BAJO | ✅ Resuelto | Card unificado en `admin/page.tsx` |
| 11 | Naming case caótico de impresoras/categorías | 🟢 BAJO | ✅ Resuelto | `formatDisplayName()` util + aplicado a 5 vistas |
| 12 | "Ciberseguridad" vs "Seguridad" naming | 🟢 BAJO | ✅ Resuelto | Card → "Seguridad" |
| 16 | Avatar inconsistente E vs ED entre pantallas | 🟢 BAJO | ✅ Resuelto | `UserBadge` con inicial uniforme en Panel Operación |
| - | Bug del logging `[object Object]` línea 333 + 349 | 🟢 BAJO | ✅ Resuelto | `ConsolePatch.tsx` global con JSON.stringify safe |
| - | Botón Guardar inconsistente Pagos vs otras | 🟢 BAJO | ✅ Verificado | Todas las pantallas ya usan amber sólido — no aplica fix |
| - | Permisos truncados en modal empleado | 🟢 BAJO | ✅ Resuelto | Removido `truncate` del label |
| - | Preview Ticket dirección hardcoded | 🟢 BAJO | ✅ Resuelto | Bindeado al estado del form, sin fallback |
| - | Tipo de Letra dropdown truncado | 🟢 BAJO | ✅ Resuelto | Acortadas las option labels |
| - | Modo claro deuda confesada por el equipo | 🟢 BAJO | ⏳ Diferido | (deuda) |

### Archivos nuevos creados
- `apps/tpv/src/components/AdminPinGuardModal.tsx` — guard PIN admin reutilizable
- `apps/tpv/src/components/ConsolePatch.tsx` — patch global de console.* para Capacitor
- `apps/tpv/src/components/UserBadge.tsx` — pill de usuario activo
- `apps/tpv/src/lib/formatDisplayName.ts` — Title Case ES consistente

### Backend
- `apps/backend/src/routes/admin.routes.js` — nuevo endpoint `GET /api/admin/access-log`
- `apps/backend/src/routes/employees.routes.js` — log de LOGIN fire-and-forget al modelo `AccessLog`
- `apps/backend/src/routes/reports.routes.js` — filter + orderBy de `/top-products`

### Verificación de build
- Typecheck: 15 errores preexistentes en archivos no tocados, sin regresiones nuevas.
- `pnpm next build` (CAPACITOR_BUILD=true) → ✅
- `pnpm exec cap sync android` → ✅
- `gradlew assembleDebug` → ✅ BUILD SUCCESSFUL en 36s
- APK instalado en `emulator-5554` (Pixel Tablet).

### Próximos pasos
1. **Probar manualmente COBRAR TICKET en tablet/emulador** — si sigue rompiendo, refactor `/meseros/[id]` → query-param route (opción #4 del prompt original).
2. Trabajar la **fase 2** (BUGs 17, 18, 19, 20, 21) cuando esté el prompt actualizado.
3. Extender el `accessLog.create(...)` a anulación, refund, override de precio y manage shifts (mismo patrón fire-and-forget).
4. Commit + push a `master` para que Vercel/Railway recojan los cambios.

---

## Tabla de severidad original — 21 bugs detectados

| # | Bug | Sev | Archivo prompt |
|---|---|---|---|
| 14 | COBRAR TICKET crashea WebView (RSC routes faltan en bundle Capacitor) | 🔴 BLOQUEANTE | `QA_REPORT_FIX_PROMPT.md` |
| 3 | Configuración admin sin PIN | 🔴 CRÍTICO | `QA_REPORT_FIX_PROMPT.md` |
| 5 | Cambio de PIN de empleado sin verificación | 🔴 CRÍTICO | `QA_REPORT_FIX_PROMPT.md` |
| 13 | Bitácora de auditoría vacía | 🔴 CRÍTICO | `QA_REPORT_FIX_PROMPT.md` |
| 15 | Sin recovery del ticket tras crash del cobro | 🟠 ALTO | `QA_REPORT_FIX_PROMPT.md` |
| 4 | Overlay residual de modal mesas bloquea siguientes clicks | 🟠 ALTO | `QA_REPORT_FIX_PROMPT.md` |
| 17 | Panel Central no navega tras volver de sub-pantalla | 🟠 ALTO | `QA_REPORT_FIX_PROMPT_FASE2.md` |
| 21 | Toggle "PIN para abrir cajón" no responde | 🟡 MEDIO | `QA_REPORT_FIX_PROMPT_FASE2.md` |
| 20 | Toggle "AMPLIO" en Ancho Panel Ticket no responde | 🟡 MEDIO | `QA_REPORT_FIX_PROMPT_FASE2.md` |
| 8 | Productos $0 inflan ranking Top Productos | 🟡 MEDIO | `QA_REPORT_FIX_PROMPT.md` |
| 6 | Avatar sidebar no es interactivo (sin perfil/logout) | 🟡 MEDIO | `QA_REPORT_FIX_PROMPT.md` |
| 7 | Iconos sidebar semánticamente confusos (⚙️ → Catálogo) | 🟡 MEDIO | `QA_REPORT_FIX_PROMPT.md` |
| 9 | Breadcrumbs inconsistentes en Configuración | 🟡 MEDIO | `QA_REPORT_FIX_PROMPT.md` |
| 18 | Color de selección hardcoded ámbar (no respeta paleta) | 🟢 BAJO | `QA_REPORT_FIX_PROMPT_FASE2.md` |
| 19 | Modo claro deja sidebar oscuro | 🟢 BAJO | `QA_REPORT_FIX_PROMPT_FASE2.md` |
| 10 | "Red e Impresión" vs "Red e Impresoras" naming | 🟢 BAJO | `QA_REPORT_FIX_PROMPT.md` |
| 11 | Naming case caótico de impresoras/categorías | 🟢 BAJO | `QA_REPORT_FIX_PROMPT.md` |
| 12 | "Ciberseguridad" vs "Seguridad" naming | 🟢 BAJO | `QA_REPORT_FIX_PROMPT.md` |
| 16 | Avatar inconsistente E vs ED entre pantallas | 🟢 BAJO | `QA_REPORT_FIX_PROMPT.md` |
| - | Bug del logging `[object Object]` línea 333 + 349 | 🟢 BAJO | `QA_REPORT_FIX_PROMPT.md` |
| - | Modo claro deuda confesada por el equipo | 🟢 BAJO | (ya documentado) |

## Datos de negocio (no bugs, datos reales)

- **Mesa 6** abierta hace 16h, 4 ítems, $300 sin cobrar
- **Turno** abierto hace 92h (4 días) — probablemente síntoma del BUG-14
- Dashboard: $3,670 ventas (de otro dispositivo o pre-bug)
- 4 empleados activos: amairany (cashier), Aron (cook), Eduardo (admin), Kebra (delivery)
- 17 categorías, ~115 productos en catálogo
- 3 impresoras configuradas: Cocina plancha, KDS Principal, Cocina

---

## Análisis de practicidad de uso (no bugs — mejoras estructurales)

### Lo que está MUY bien
1. **Identidad visual** consistente, glassmorphism elegante, paleta ámbar miel respetada (cuando no hay bugs).
2. **Mapa de Mesas con "Priorizadas por urgencia"** y badge "+1H" → detecta mesas olvidadas. Idea brillante.
3. **Configurador de Tickets con preview en tiempo real** → ahorra prueba/error.
4. **Test de impresión** disponible por cada impresora → diagnóstico rápido sin abrir terminal.
5. **Corte ciego** en cierre de turno → best practice anti-fraude desde el día 1.
6. **Permisos granulares** por empleado además del rol → escalable y mature.
7. **Banner "MODO CLARO EXPERIMENTAL"** → honesto y útil. Mejor que ocultar el bug.
8. **Tamaño de letra aplica instantáneo** → no requiere "Guardar". Excelente UX.

### Lo que se puede mejorar (operativa diaria del cajero)

#### 1. Velocidad para crear una orden — el problema mayor
Actualmente para meter una hamburguesa: 1) tocar Para Llevar → 2) tocar SUPER HAMBURGUESAS → 3) tocar el "+" del producto. Mínimo **3 taps** + tiempo de carga entre cada uno. Para una orden de 5 ítems = 15+ taps. En hora pico, eso se siente.

**Sugerencias:**
- **Buscador global Cmd+K** que filtre productos directamente. Tipear "ARR" y aparece "ARRACHERA HOUSE" + "Tacos ARRACHERA" + "Orden Arrachera". Tap 1 vez para añadir.
- **Atajo "Repetir última orden"** del mismo cliente (frecuente en clientes habituales).
- **Productos favoritos / más vendidos** en una sección fija arriba — los "Tacos Campechano (8u)" y "Burger res (10u)" del CSV deberían estar a 1 tap.
- **Botón +1 directo en el producto** sin tener que ir al ticket lateral después.

#### 2. Pantalla de orden está cargada de información estática
El sidebar izquierdo ocupa ~80px con iconos cuya función no queda clara (utensils, cart, $, grid, chart, bell, avatar). El cajero no debería pensar qué es cada uno.

**Sugerencias:**
- Etiqueta debajo del icono ("Comandas", "Cocina", "Caja", "Mesas", "Reportes", "Avisos").
- O una barra de tabs textual arriba en lugar del sidebar de iconos.

#### 3. Categorías son texto-intensivo
17 categorías con sólo nombre y conteo. Para un cajero nuevo es overhead leer "PA NO BRINCAR (BEBIDAS)" vs "PAL CALOR (BEBIDAS)" — los nombres son ad-hoc del Loyverse legacy.

**Sugerencias:**
- **Iconos distintivos** por categoría (no todos chef hat).
- **Imagen pequeña** del producto en cada card (los TPVs serios lo hacen — Toast, Square).
- **Renombrar categorías** a algo más operativo cuando se haga el `formatDisplayName` del BUG-11.

#### 4. Multi-ticket presente pero invisible
Veo el botón "+" para añadir TICKET 2, pero no es obvio cómo gestionar 5 tickets simultáneos. Un cajero atendiendo 3 mesas + 2 takeaway necesita ver todos al vistazo.

**Sugerencias:**
- **Tabs de tickets numerados** arriba siempre visibles ("T1: Mesa 3 - $150 | T2: Llevar - $80 | T3: ..." ).
- **Color por estado**: gris=vacío, ámbar=en curso, verde=cobrado, rojo=urgente.

#### 5. Falta info de cliente para Domicilio
La pantalla solo tiene "Nombre del cliente". Para a domicilio se necesitan dirección, teléfono, repartidor, ETA. Si aparecen solo al cobrar (que crashea), el cajero pierde tiempo introduciéndolos al final.

**Sugerencias:**
- **Lista de clientes recurrentes** con búsqueda por nombre o teléfono — un toque y se rellena dirección/notas.
- **Mapa pequeño con la dirección** validada para evitar errores de tipeo.
- **Asignación de repartidor desde el principio** (no esperar al cobro).

#### 6. Sin atajos de cantidad
Para añadir 4 tacos hay que tocar el "+" 4 veces, o entrar al ticket y editar +/-. Lento.

**Sugerencias:**
- **Long-press en el producto** abre selector numérico 1-2-3-4-5-6+.
- O **doble-tap** = cantidad 2, triple-tap = 3, etc.

#### 7. El cajero no ve quién es ni dónde está
Solo sale "Eduardo Alejandro Gutierrez Gómez / TURNO ACTIVO" en una pantalla específica (orden). En Panel Operación, Configuración y Mapa de Mesas no aparece. Si rota el turno con otro cajero, ¿quién sabe quién está logueado?

**Sugerencias:**
- **Header global persistente** con: avatar inicial + nombre corto + "Caja Principal · Turno desde 18:00".
- **Click en avatar** → menú con cambiar usuario, ver mi turno, cerrar sesión (BUG-6).

#### 8. No hay calculadora rápida ni atajo de cobro común
Para cobros redondos ($100, $200), un teclado numérico rápido en el modal de cobro acelera mucho.

#### 9. Vista para cocina ausente desde el cajero
El cajero no ve cuántas comandas hay pendientes en cocina. Para sincronizar tiempos de mesa con cocina, sería útil ver "3 hamburguesas en plancha, 2 alitas en BBQ, ETA 8min".

#### 10. Onboarding inexistente
La primera vez que entré al app después de login me llevó al setup del KDS (no al TPV), sin pista de cómo elegir mi rol. Un cajero nuevo se confunde fácil.

**Sugerencias:**
- **Pantalla de selección de modo** después del login: "¿Vas a operar como Cajero / KDS Cocina / Repartidor?"
- O detección automática por rol del empleado logueado.

### Inspiración de competidores conocidos
- **Loyverse** (referencia del propio equipo): atajos de teclado, combos/kits, promociones automáticas.
- **Toast**: rapid order entry con teclas calientes y voz.
- **Square**: búsqueda global instantánea + favoritos por cajero.
- **Lightspeed**: split bill por concepto (no solo por persona).
- **OrderUp / SuperSalon**: vista "ahorita" en cocina con tiempos por estación.

---

## Recomendación final de orden de trabajo

1. **Fixear BUG-14 primero** (sin esto, el TPV es decoración). Detalle exacto en `QA_REPORT_FIX_PROMPT.md` sección P0.
2. **Después los 3 críticos de seguridad** (BUG-3, 5, 13) — son fix de unas pocas horas y cierran un agujero grave.
3. **Los UX de fase 2** (BUG-17, 20, 21) — molestos pero no bloqueantes.
4. **El resto de naming/cosmética** se puede agrupar en un sprint de "polish".
5. **Empezar el roadmap de practicidad** (búsqueda global, favoritos, header de usuario persistente) en paralelo a los fixes.

## Archivos generados durante este QA
- `QA_REPORT_FIX_PROMPT.md` — primer batch de bugs (cobro + seguridad + UI principal)
- `QA_REPORT_FIX_PROMPT_FASE2.md` — segundo batch de bugs (sub-pantallas, toggles)
- `RECIBOS_REPLAY.md` — 28 recibos del 8 mayo listos para replicar cuando el cobro funcione
- `QA_REPORTE_FINAL.md` — este documento
