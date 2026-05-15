# Handoff: MRTPVREST SaaS Admin Dashboard

> **Para el desarrollador:** Los archivos HTML en esta carpeta son **prototipos de diseño de alta fidelidad** — no código de producción para copiar directamente. Tu tarea es recrear estos diseños en el codebase existente de Next.js (`saas/`) usando sus patrones, componentes y convenciones establecidas. Los archivos son referencias visuales y de comportamiento.

---

## Overview

Rediseño completo del panel de administración SaaS de MRTPVREST — el tablero interno que usan los dueños del software (Super Admin) para gestionar todos los tenants (restaurantes), planes, facturación, errores y configuración global.

**Stack del codebase target:** Next.js 14 · TypeScript · Tailwind CSS · App Router (`saas/app/(dashboard)/`)

**Fidelidad:** Alta fidelidad (hifi) — pixel-perfect. Colores, tipografía, espaciado e interacciones deben coincidir con el diseño de referencia.

---

## Design Tokens — Halo Design System

### Paleta de colores (dark mode — default)

```css
/* Fondos */
--bg:     #08080f   /* fondo raíz */
--surf-1: #0c0c17   /* superficie principal (sidebar, cards) */
--surf-2: #11111e   /* superficie secundaria (inputs, hover rows) */
--surf-3: #161627   /* superficie terciaria (tags, skeletons) */

/* Bordes */
--border-1: #1e1e33  /* border principal */
--border-2: #2a2a44  /* border secundario / hover */

/* Texto */
--text:       #e8e8f2  /* texto principal */
--text-muted: #8585a3  /* texto secundario */
--text-dim:   #5a5a7a  /* texto terciario / labels */

/* Brand — iris purple */
--brand:      #7c3aed
--brand-hi:   #9472ff
--brand-soft: rgba(124, 58, 237, 0.12)
--brand-glow: rgba(124, 58, 237, 0.35)

/* Semánticos */
--ok:      #10b981   --ok-soft:   rgba(16,185,129,0.14)
--warn:    #f59e0b   --warn-soft: rgba(245,158,11,0.14)
--err:     #ef4444   --err-soft:  rgba(239,68,68,0.14)
--info:    #3b82f6   --info-soft: rgba(59,130,246,0.14)
```

### Light mode (toggle disponible)

```css
--bg:         #f7f7fb
--surf-1:     #ffffff
--surf-2:     #f2f2f7
--surf-3:     #ebebf1
--border-1:   #e4e4ec
--border-2:   #d4d4de
--text:       #0c0c17
--text-muted: #5a5a7a
--text-dim:   #8585a3
--brand-soft: rgba(124,58,237,0.08)
```

### Tipografía

| Rol | Familia | Uso |
|-----|---------|-----|
| Display | `Syne` (600–800) | Títulos de página, KPI values, nombres de plan |
| Body | `DM Sans` (400–700) | Todo el cuerpo, navegación, botones |
| Mono | `DM Mono` (400–500) | IDs, códigos, timestamps, métricas |

```css
--f-display: 'Syne', system-ui, sans-serif;
--f-body:    'DM Sans', system-ui, sans-serif;
--f-mono:    'DM Mono', ui-monospace, monospace;
```

Google Fonts import:
```html
https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Mono:wght@400;500&display=swap
```

### Espaciado y radios

```
Border radius: 8px (botones/inputs) · 12px (cards) · 14px (modals) · 999px (pills)
Card padding: 18px (normal) · 14px (dense) · 22px (cozy)
Gap de grids: 14px (normal) · 10px (dense) · 18px (cozy)
Row height en tablas: 36px (normal) · 30px (dense) · 42px (cozy)
Sidebar width: 232px
```

### Sombras

```css
shadow-sm: 0 1px 3px rgba(0,0,0,0.35)
shadow-md: 0 4px 16px rgba(0,0,0,0.45)
brand-glow: 0 0 0 1px var(--iris-700), 0 2px 10px var(--brand-glow)
```

---

## Shell / Layout

### Estructura base (`app/(dashboard)/layout.tsx`)

```
┌──────────────┬─────────────────────────────────────────┬──────────────┐
│   SIDEBAR    │              MAIN CONTENT               │   AI PANEL   │
│   232px      │         flex:1, overflow-y:auto         │   380px      │
│   sticky     │                                         │  (condicional)│
└──────────────┴─────────────────────────────────────────┴──────────────┘
```

- El AI Panel es un tercer panel que aparece/desaparece (no un drawer overlay)
- CSS grid: `232px 1fr` (sin IA) · `232px 1fr 380px` (con IA)
- Altura: `100vh`, sin scroll en el shell — el scroll está en `<main>`

### Sidebar (`components/Sidebar.tsx`)

**Estructura visual:**
1. **Brand header** — logo gradiente iris + "MRTPVREST" (Syne 800) + "SaaS · Central" (DM Mono 9px)
2. **Search box** clickable — abre command palette (`⌘K`)
3. **Nav groups:**
   - `PANEL` → Vista general
   - `NEGOCIO` → Marcas · Planes · Facturación
   - `SISTEMA` → TPV Config · TPV Updates · Logs · Errores · API Keys · Ajustes
   - `IA` → Asistente IA
4. **Footer** — avatar "JL", rol "Super Admin", dot verde online

**Estados nav link:**
- Default: color `--text-muted`, fondo transparent
- Hover: fondo `--surf-2`, color `--text`
- Active: fondo `--brand-soft`, color `--brand-hi`, border `rgba(124,58,237,0.18)`

**Badge de errores:**
- Número en rojo sobre el link "Errores" (`--err-soft` bg, `--err` color)

### Topbar (por página)

- Sticky top, `backdrop-filter: blur(12px)`
- Izquierda: breadcrumb en DM Mono uppercase + título en Syne 18px
- Derecha: pill de status "Sistema OK · 99.98%" + toggle dark/light + botón IA

---

## Pantallas

### 1. Vista General — `/dashboard`

**Layout:** header → alert strip (condicional) → KPI grid 4col → grid 2col (chart | activity) → grid 2col (funnel | cohort) → grid 2col (mapa | top tenants) → alerts table

**KPI Cards (4):**
| KPI | Valor | Accent | Delta |
|-----|-------|--------|-------|
| MRR Total | `$X,XXX/mo` | iris | vs. mes anterior % |
| Marcas activas | `X / Y total` | ok (verde) | netas mes % |
| Conversión trial→paid | `X%` | info (azul) | vs. cohorte previa |
| ARPU · Churn | `$XX · X.X%` | warn (amber) | churn % |

Cada KPI tiene:
- Borde izquierdo de 2px en color accent
- Label en DM Mono 10px uppercase
- Valor en Syne 28px 700
- Delta pill con fondo semitransparente (ok/err según positivo/negativo)
- Sparkline SVG debajo (línea + fill, 28px de alto)

**Live ticker:** cada 4.5s un KPI flashea con `background: var(--brand-soft)` durante 1.4s

**MRR Stacked Bar Chart:**
- SVG puro (no Chart.js) — stacked bars por mes
- 3 colores: Basic `#3b82f6`, Pro `#7c3aed`, Unlimited `#f59e0b`
- Grid lines con `--border-1`
- Eje Y con prefijo `$` en DM Mono

**Funnel (trial → conversión):**
```
Registros     412  100%  ████████████████████ iris-500
Onboarding IA 384   93%  ███████████████████  iris-400
Primer venta  318   77%  ████████████████     iris-300
Conversión    186   45%  ████████████         ok
Retención 90d 142   34%  ██████████           ok
```

**Cohort Heatmap:** tabla 8×8, celda 36×22px, color `rgba(124,58,237, opacity)` donde opacity va de 0.15 (valor bajo) a 0.85 (100%)

**Mapa LATAM:** SVG abstracto con puntos por país, tamaño proporcional al count de tenants. Ver `saas-admin/charts.jsx` → `LatamMap`.

**Alertas SLA:**
- `critical` → borde izquierdo rojo, badge `err`
- `warn` → borde izquierdo amber, badge `warn`
- Botón ACK inline
- Opacidad 55% cuando `acked: true`

**API endpoints:**
```typescript
GET /api/saas/mrr          → { mrr, growth, byPlan }
GET /api/saas/tenants      → Tenant[]
GET /api/saas/plans        → Plan[]
GET /api/admin/global-config → GlobalConfig
```

---

### 2. Marcas — `/marcas`

**Controles:** search input + tabs de status (ALL/ACTIVE/TRIAL/PAST_DUE/SUSPENDED) + selects de plan/país/sort

**Tabla de tenants:**

| Col | Contenido |
|-----|-----------|
| checkbox | bulk select |
| Marca | avatar (gradiente color único por tenant) + nombre + `slug.mrtpvrest.com` |
| Plan | dot de color + nombre + precio |
| Estado | Pill con dot (ACTIVE=ok, TRIAL=info, PAST_DUE=warn, SUSPENDED/EXPIRED=err) |
| Health | barra de 60px + número. Verde ≥75, amber 50-74, rojo <50 |
| MRR | DM Mono bold |
| Órdenes 30d | DM Mono |
| País | emoji bandera + código |
| Última actividad | DM Mono timeAgo |
| → | chevron button |

Click en fila → navega a `/marcas/[id]` (Tenant Detail)

**API:**
```typescript
GET  /api/saas/tenants
PATCH /api/saas/tenants/:id/status  { status }
PATCH /api/saas/tenants/:id/plan    { planId }
POST  /api/saas/tenants/:id/gift-days { days }
DELETE /api/saas/tenants/:id
```

---

### 3. Tenant Detail — `/marcas/[id]`

Pantalla completa con tabs: **Overview / Facturación / Módulos & TPV / Actividad / Errores**

**Header card:**
- Fondo con gradiente sutil del color del tenant
- Avatar grande (64px, emoji)
- Nombre en Syne 24px + status pill + plan pill
- Email, WhatsApp, usuarios, sucursales
- CTAs: "Resumen IA", "Abrir tenant"

**Tab: Overview**
- KPIs: MRR · Health score · Órdenes 30d · LTV
- Sparkline de ventas 14 días
- Panel de acciones rápidas (activar/pausar/cambiar plan/WhatsApp/email/eliminar)
- Stepper de onboarding: 5 pasos, estado visual por step (pending/current/done)

**Tab: Facturación**
- KPIs: Pagado total · MRR · Próxima factura
- Tabla de invoices con status pill (PAID=ok, FAILED=err, PENDING=warn)

**Tab: Módulos & TPV**
- Grid 2×2 de módulos con toggle (Inventario/Delivery/Tienda/Kiosko)
- Activo: fondo `--brand-soft`, icono iris
- Inactivo: fondo `--surf-2`, icono dim

**API:**
```typescript
GET /api/saas/tenants/:id
GET /api/saas/tenants/:id/invoices
PATCH /api/saas/tenants/:id        { modules }
```

---

### 4. Planes — `/planes`

**3 plan cards** clickeables:
- Selected: fondo `linear-gradient(180deg, {color}10, --surf-1 70%)`, border del color, box-shadow
- Badge "POPULAR" flotante en Pro
- Precio en Syne 40px
- Stats en grid 2×2: Trial días / Sucursales / Empleados / Módulos

**Panel de configuración:** feature flags (toggles) + módulos (botones on/off)

**API:**
```typescript
GET   /api/saas/plans/all
PATCH /api/saas/plans/:id  { ...planFields }
POST  /api/saas/plans      { ...planFields }
DELETE /api/saas/plans/:id
```

---

### 5. Facturación — `/facturacion`

**KPIs:** MRR · ARR proyectado · Cobrado total · Fallido

**Tabla de facturas** (orden desc por fecha):
- ID truncado · Marca (avatar + nombre) · Período · Monto · Status · Pagado

**Panel "Salud financiera":**
- 5 métricas con barra de progreso horizontal
- Cada barra: label · valor alineado derecha · barra fill con color según nivel

**API:**
```typescript
GET /api/saas/mrr
GET /api/saas/tenants
GET /api/saas/tenants/:id/invoices
```

---

### 6. Logs — `/logs`

- Feed cronológico con filtro por tipo (register/activated/payment/trial_end/failed/upgrade/churn/ai)
- Cada item: timestamp (DM Mono, 60px) + icono en roundel + type pill + tenant bold + detalle
- Live polling: intervalo de 4s, indicador de pausa
- Icono por tipo: ver `saas-admin/screen-overview.jsx` → `ACT_ICON`

---

### 7. Errores — `/errors`

- Polling cada 4s a `/api/admin/logs/db`
- Filtro por nivel: CRITICAL / ERROR / WARN / INFO (multi-select como pills)
- Border izquierdo con color por nivel: CRITICAL+ERROR=err · WARN=warn · INFO=info
- Click expande el stack trace con acciones: Copiar / Crear issue / Analizar IA
- KPIs: counts por nivel en las últimas 24h

**API:**
```typescript
GET /api/admin/logs/db?limit=200&level=CRITICAL,ERROR
```

---

### 8. TPV Config — `/tpv-config`

- Toggle de vista: grid (tarjetas) / tabla
- Cada card/fila: emoji tenant + nombre + sucursal + país + status online (verde/rojo) + versión instalada + tipos de orden
- Border izquierdo con `accentColor` del tenant
- Badge de versión: verde si es `3.18.4` (current), amber si es menor

**API:**
```typescript
GET /api/saas/tpv-configs
PUT /api/saas/tpv-configs/:locationId  { config }
```

---

### 9. TPV Updates — `/tpv-updates`

- Tabs por canal: production / beta / dev
- Cards de bundle: versión + active badge + tamaño + checksum + notas + barra de rollout %
- Acciones: Bajar · Activar (si no es active)

**API:**
```typescript
GET  /api/ota/bundles?channel=production
POST /api/ota/trigger  { channel, version }
```

---

### 10. API Keys — `/api-keys`

- Tabla con: Nombre + Tenant + Key (maskeada, toggle reveal) + Scopes (pills) + Status + Uso 24h + Última vez
- Botón de reveal por fila
- Botón copiar (con feedback visual de check por 1.5s)

**API:**
```typescript
GET    /api/saas/api-keys
POST   /api/saas/api-keys  { name, scopes }
DELETE /api/saas/api-keys/:id
```

---

### 11. Ajustes — `/ajustes`

Grid 2×2 de cards con toggles:
- **Plataforma:** Registro libre · Trial auto · Modo mantenimiento · WhatsApp global
- **IA:** Onboarding conversacional · Promos automáticas · Gemini prod/dev
- **Cuenta:** Email · Cambiar contraseña · Cerrar sesión
- **Integraciones:** Stripe live · API key Whapi.cloud

**API:**
```typescript
GET /api/admin/global-config
PUT /api/admin/global-config  { key: value }
```

---

## Panel IA (`components/SaaSAgent.tsx`)

**Diseño:** panel lateral de 380px (no drawer flotante, no modal — es la 3ª columna del grid)

**Estructura:**
1. Header: logo cónico iris + "MRTPV Intelligence" + "Super Admin · Gemini" + botón X
2. Chat body: scroll, mensajes user (derecha, iris bg) + AI (izquierda, surf-2 bg)
3. Mensajes AI pueden incluir **data cards** embebidos: tabla con rows `{ label, value, kind }`
4. Indicador de typing: 3 dots animados
5. Quick chips: Resumen errores · Facturación · Churn risk · Top 5 marcas · Trials · Health
6. Input: textarea auto-resize + botón send iris

**Endpoint:**
```typescript
POST /api/saas-ai/agent
Body: { messages: { role: 'user'|'assistant', content: string }[] }
Response: { message: string }
```

---

## Componentes Compartidos

### Pill / Badge
```tsx
// Variantes: ok | warn | err | info | muted | iris (default)
<Pill variant="ok" dot>ACTIVE</Pill>
```

### KPI Card
```tsx
<KpiCard
  label="MRR Total"
  value="$4,230"
  sub="/mo"
  delta={14.8}
  deltaLabel="vs mes anterior"
  accent="var(--brand)"
  icon={<DollarIcon/>}
  spark={<Sparkline data={[...]} color="var(--brand)"/>}
/>
```

### Health Bar
```tsx
// 60px width, 5px height
// color: ok ≥75 | warn 50-74 | err <50
<HealthBar value={82}/>
```

### Avatar de tenant
```tsx
// Gradiente del color único del tenant, emoji centrado
<TenantAvatar tenant={t} size={28}/>
```

### Toggle switch
```tsx
// 32×18px, thumb 12px, transición 0.15s
<Toggle checked={on} onChange={fn}/>
```

---

## Interacciones y Animaciones

| Elemento | Animación | Duración | Easing |
|----------|-----------|----------|--------|
| KPI flash (live data) | `background: --brand-soft → transparent` | 1.4s | ease-out |
| Live dot (status) | opacity 1→0.4→1 | 2.4s | ease-in-out infinite |
| Ring pulse (online indicator) | scale 1→2.2 + opacity 0.6→0 | 2s | ease-out infinite |
| Row hover | background transition | 0.1s | linear |
| Nav link hover | background + color | 0.12s | linear |
| Drawer/modal entrada | translateX(20px)+opacity 0 → 0+1 | 0.22s | cubic-bezier(.4,0,.2,1) |
| Toast entrada | translateY(20px)+opacity 0 → 0+1 | 0.2s | ease |
| Skeleton loading | gradient sweep 200%→-200% | 1.4s | ease-in-out infinite |

---

## Flujo de Command Palette (⌘K)

1. Atajo `Cmd+K` o `/` (cuando no hay input focuseado)
2. Modal centrado, `padding-top: 14vh`
3. Input de búsqueda → filtra en tiempo real:
   - Tenants (por nombre/slug)
   - Pantallas (por label)
   - Quick actions de IA
4. Grupos con labels en DM Mono uppercase
5. `Enter` selecciona el primer resultado
6. `Escape` cierra

---

## Polling en vivo

| Pantalla | Endpoint | Intervalo | Notas |
|----------|----------|-----------|-------|
| Errors | `/api/admin/logs/db` | 4s | Se pausa con toggle |
| Logs | `/api/saas/tenants` | 4s | Se pausa con toggle |
| Overview activity | `/api/saas/tenants` | 4.5s | Solo trigger visual, no refetch completo |

---

## Responsive

| Breakpoint | Cambio |
|------------|--------|
| < 1280px | AI panel de 380 → 340px |
| < 1100px | KPI grid: 4col → 2col |
| < 900px | Sidebar se oculta (mobile: hamburger + drawer overlay) |
| < 768px | Tabla scroll horizontal, contenido a 1col |

El sidebar mobile sigue el patrón existente en `saas/components/Sidebar.tsx` (ya implementado).

---

## Archivos de referencia incluidos

```
MRTPVREST SaaS Admin.html     → Prototipo completo interactivo (referencia principal)
saas-admin/styles.css         → Todos los tokens CSS y clases de utilidad
saas-admin/screen-overview.jsx → Componentes de Vista General (KPIs, charts, funnel, mapa)
saas-admin/screen-marcas.jsx  → Tabla de tenants + Tenant drilldown completo
saas-admin/screens.jsx        → Planes, Facturación, Logs, Errors, TPV Config/Updates, API Keys, Ajustes
saas-admin/components.jsx     → Primitivos: KPI, Card, Status, Avatar, HealthBar, Sidebar, Topbar
saas-admin/charts.jsx         → Sparkline, MrrStackedBar, Funnel, CohortHeatmap, LatamMap, DonutGauge
saas-admin/ai-panel.jsx       → Panel IA lateral completo
saas-admin/icons.jsx          → Set de iconos SVG (Lucide-inspired)
saas-admin/data.js            → Datos mock para referencia de estructura de datos
```

---

## Checklist de implementación

### Fase 1 — Shell (2-3h)
- [ ] Actualizar `layout.tsx` para soportar el tercer panel (AI)
- [ ] Refactorizar `Sidebar.tsx` con nueva marca, search box, y grupos de navegación
- [ ] Implementar topbar sticky con blur
- [ ] Sistema de theming dark/light con CSS custom properties

### Fase 2 — Vista General (4-6h)
- [ ] KPI cards con sparklines (usar SVG inline, no librería)
- [ ] MRR stacked bar chart en SVG
- [ ] Funnel trial→conversión
- [ ] Cohort heatmap
- [ ] Mapa LATAM abstracto
- [ ] Activity feed con live polling
- [ ] Alertas SLA con ACK
- [ ] Top tenants por MRR

### Fase 3 — Marcas + Drilldown (4-5h)
- [ ] Tabla con filtros, búsqueda, sort
- [ ] Health bar component
- [ ] Tenant avatar component
- [ ] Drilldown con 5 tabs
- [ ] Onboarding stepper
- [ ] Acciones rápidas (modals: cambio plan, días trial, eliminar)

### Fase 4 — Pantallas secundarias (4-6h)
- [ ] Planes (cards + editor de features/módulos)
- [ ] Facturación (tabla + health financiero)
- [ ] Logs (feed + filtros + polling)
- [ ] Errores (polling + expand stack + filtros)
- [ ] TPV Config (grid/tabla + indicador online/offline)
- [ ] TPV Updates (channels + rollout bar)
- [ ] API Keys (reveal toggle + copy)
- [ ] Ajustes (toggles globales)

### Fase 5 — IA + Command Palette (3-4h)
- [ ] Panel lateral IA (3ª columna grid)
- [ ] Chat UI con data cards embebidos
- [ ] Command palette (⌘K)
- [ ] Toast notifications

---

## Notas para el desarrollador

1. **No uses Chart.js** — los gráficos están implementados en SVG puro para evitar dependencias y tener control total sobre el estilo. Ver `saas-admin/charts.jsx` para referencia.

2. **El AI panel no es un drawer** — es la 3ª columna del CSS grid del shell. Cuando se abre, el grid cambia de `232px 1fr` a `232px 1fr 380px`. Esto es importante para que el contenido principal se comprima, no se tape.

3. **Colores de tenant** — cada tenant tiene un color único generado por su posición en el array. En producción, guardar este color en la DB como campo del tenant para consistencia.

4. **Live polling** — implementar con `useEffect` + `setInterval` + cleanup. El intervalo se pausa cuando el usuario hace click en "Pausar". El polling no debe dispararse cuando la pestaña está oculta (`document.hidden`).

5. **Command palette** — considerar usar `cmdk` (npm) en lugar de implementar desde cero. El diseño es compatible.

6. **DM Mono para números** — todos los valores numéricos (precios, IDs, timestamps, métricas) deben usar `font-family: var(--f-mono)` con `font-feature-settings: "tnum" 1` para que los dígitos sean tabular (mismo ancho).
